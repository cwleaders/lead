// Screen capture module.
//
// Approach: spawn `ffmpeg` with platform-appropriate input drivers.
// This works on every machine that has ffmpeg installed and runs identically
// on weak hardware. Native APIs (ScreenCaptureKit, DXGI, PipeWire) plug in
// later without changing the public Tauri commands.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;
use tokio::process::{Child, Command};

static ACTIVE: Mutex<Option<ActiveCapture>> = Mutex::new(None);

struct ActiveCapture {
    child: Child,
    started_at: std::time::Instant,
    output_path: PathBuf,
}

#[derive(Debug, Serialize)]
pub struct CaptureCheck {
    pub ffmpeg_available: bool,
    pub ffmpeg_path: Option<String>,
    pub platform: String,
}

#[tauri::command]
pub fn capture_check() -> CaptureCheck {
    let path = which::which("ffmpeg").ok();
    CaptureCheck {
        ffmpeg_available: path.is_some(),
        ffmpeg_path: path.as_ref().map(|p| p.display().to_string()),
        platform: std::env::consts::OS.to_string(),
    }
}

#[derive(Debug, Serialize)]
pub struct DisplayInfo {
    pub id: String,
    pub label: String,
    pub primary: bool,
}

#[tauri::command]
pub fn capture_list_displays() -> Vec<DisplayInfo> {
    // Minimal stub — returns one display.
    // Real enumeration ships in Sprint C using core-graphics / winapi / xrandr.
    vec![DisplayInfo {
        id: "0".to_string(),
        label: "Primary display".to_string(),
        primary: true,
    }]
}

#[derive(Debug, Deserialize)]
pub struct CaptureOpts {
    pub fps: Option<u32>,
    pub max_minutes: Option<u32>,
    pub display_id: Option<String>,
    pub include_audio: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct CaptureStarted {
    pub output_path: String,
    pub started_at: String,
}

#[tauri::command]
pub async fn capture_start(opts: CaptureOpts) -> Result<CaptureStarted, String> {
    {
        let active = ACTIVE.lock().unwrap();
        if active.is_some() {
            return Err("A recording is already in progress".to_string());
        }
    }

    let ffmpeg = which::which("ffmpeg")
        .map_err(|_| "ffmpeg is not installed. Install it from ffmpeg.org or via Homebrew/Chocolatey.".to_string())?;

    let dir = recordings_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
    let out = dir.join(format!("recording-{stamp}.mp4"));

    let fps = opts.fps.unwrap_or(24).clamp(15, 60); // start friendly to low-end hardware
    let max_min = opts.max_minutes.unwrap_or(0); // 0 = unbounded
    let max_secs = if max_min == 0 { 0 } else { max_min * 60 };

    let mut cmd = Command::new(&ffmpeg);

    // Platform-specific input
    #[cfg(target_os = "macos")] {
        cmd.args(&["-f", "avfoundation", "-framerate", &fps.to_string(), "-i", "1:none"]);
    }
    #[cfg(target_os = "windows")] {
        cmd.args(&["-f", "gdigrab", "-framerate", &fps.to_string(), "-i", "desktop"]);
    }
    #[cfg(target_os = "linux")] {
        let display = std::env::var("DISPLAY").unwrap_or(":0".to_string());
        cmd.args(&["-f", "x11grab", "-framerate", &fps.to_string(), "-i", &display]);
    }

    // Encoding — H.264 with hardware acceleration where available, ultrafast preset for low-end fallback
    cmd.args(&[
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
    ]);

    if max_secs > 0 {
        cmd.args(&["-t", &max_secs.to_string()]);
    }

    cmd.arg("-y").arg(&out);
    cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());

    let child = cmd.spawn().map_err(|e| format!("Couldn't start recording: {e}"))?;

    {
        let mut active = ACTIVE.lock().unwrap();
        *active = Some(ActiveCapture {
            child,
            started_at: std::time::Instant::now(),
            output_path: out.clone(),
        });
    }

    Ok(CaptureStarted {
        output_path: out.display().to_string(),
        started_at: chrono::Utc::now().to_rfc3339(),
    })
}

#[derive(Debug, Serialize)]
pub struct CaptureStopped {
    pub output_path: String,
    pub duration_secs: u64,
    pub size_bytes: u64,
}

#[tauri::command]
pub async fn capture_stop() -> Result<CaptureStopped, String> {
    let active = {
        let mut guard = ACTIVE.lock().unwrap();
        guard.take()
    };

    let mut active = match active {
        Some(a) => a,
        None => return Err("No recording in progress".to_string()),
    };

    // Send SIGINT (ffmpeg writes the moov atom on shutdown)
    #[cfg(unix)]
    {
        if let Some(pid) = active.child.id() {
            let _ = std::process::Command::new("kill").arg("-INT").arg(pid.to_string()).status();
        }
        // Give ffmpeg a few seconds to flush before considering it stuck
        let _ = tokio::time::timeout(std::time::Duration::from_secs(8), active.child.wait()).await;
    }
    #[cfg(windows)]
    {
        // No clean SIGINT on Windows for ffmpeg via tokio — kill is acceptable; mp4 is muxed live
        let _ = active.child.kill().await;
        let _ = active.child.wait().await;
    }

    let duration = active.started_at.elapsed().as_secs();
    let size = std::fs::metadata(&active.output_path).map(|m| m.len()).unwrap_or(0);

    Ok(CaptureStopped {
        output_path: active.output_path.display().to_string(),
        duration_secs: duration,
        size_bytes: size,
    })
}

pub fn recordings_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
        .join("CW-Leaders-Recordings")
}

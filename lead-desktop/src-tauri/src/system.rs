// System probe — lets the UI choose a sane default tier (Lite / Standard / Pro)
// based on the user's hardware, so the app behaves well on weak machines.

use serde::Serialize;
use sysinfo::System;

#[derive(Debug, Serialize)]
pub struct CapabilityProbe {
    pub cpu_cores: usize,
    pub cpu_brand: String,
    pub total_memory_mb: u64,
    pub available_memory_mb: u64,
    pub os: String,
    pub os_version: String,
    pub recommended_mode: String,
    pub recommended_fps: u32,
    pub recommended_resolution: String,
    pub local_ai_safe: bool,
}

#[tauri::command]
pub fn system_capability_probe() -> CapabilityProbe {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu_cores = sys.cpus().len();
    let cpu_brand = sys.cpus().first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let total_mb = sys.total_memory() / 1024 / 1024;
    let avail_mb = sys.available_memory() / 1024 / 1024;
    let os = std::env::consts::OS.to_string();
    let os_version = System::os_version().unwrap_or_else(|| "unknown".to_string());

    // Auto-tier the app for the hardware
    let (mode, fps, res, ai_ok) = if total_mb < 4096 || cpu_cores < 4 {
        ("lite", 24, "720p", false)
    } else if total_mb < 8192 || cpu_cores < 8 {
        ("standard", 30, "1080p", true)
    } else {
        ("pro", 60, "1440p", true)
    };

    CapabilityProbe {
        cpu_cores,
        cpu_brand,
        total_memory_mb: total_mb,
        available_memory_mb: avail_mb,
        os,
        os_version,
        recommended_mode: mode.to_string(),
        recommended_fps: fps,
        recommended_resolution: res.to_string(),
        local_ai_safe: ai_ok,
    }
}

#[tauri::command]
pub fn system_open_external(url: String) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") && !url.starts_with("mailto:") {
        return Err("only http/https/mailto URLs allowed".to_string());
    }
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(&url).status();
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("cmd").args(&["/C", "start", &url]).status();
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(&url).status();
    Ok(())
}

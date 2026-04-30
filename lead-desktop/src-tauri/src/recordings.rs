// Recordings module — list/open/delete files in the user's local recordings folder.

use serde::Serialize;
use std::path::PathBuf;
use crate::capture::recordings_dir;

#[derive(Debug, Serialize)]
pub struct RecordingFile {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub created_secs: u64,
}

pub fn ensure_recordings_dir() -> std::io::Result<PathBuf> {
    let dir = recordings_dir();
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

#[tauri::command]
pub fn recordings_list() -> Result<Vec<RecordingFile>, String> {
    let dir = ensure_recordings_dir().map_err(|e| e.to_string())?;
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut out: Vec<RecordingFile> = entries.filter_map(|e| e.ok())
        .filter_map(|e| {
            let path = e.path();
            let ext_ok = path.extension().map(|x| x == "mp4" || x == "vmap").unwrap_or(false);
            if !ext_ok { return None; }
            let meta = e.metadata().ok()?;
            let created = meta.created().or_else(|_| meta.modified()).ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            Some(RecordingFile {
                path: path.display().to_string(),
                name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                size_bytes: meta.len(),
                created_secs: created,
            })
        })
        .collect();
    out.sort_by(|a, b| b.created_secs.cmp(&a.created_secs));
    Ok(out)
}

#[tauri::command]
pub fn recordings_open_folder() -> Result<(), String> {
    let dir = ensure_recordings_dir().map_err(|e| e.to_string())?;
    let path = dir.display().to_string();
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(&path).status();
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("explorer").arg(&path).status();
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(&path).status();
    Ok(())
}

#[tauri::command]
pub fn recordings_delete(path: String) -> Result<(), String> {
    let dir = ensure_recordings_dir().map_err(|e| e.to_string())?;
    let candidate = PathBuf::from(&path);
    // Safety: only delete inside the recordings dir
    if !candidate.starts_with(&dir) {
        return Err("refused to delete outside recordings folder".to_string());
    }
    std::fs::remove_file(&candidate).map_err(|e| e.to_string())
}

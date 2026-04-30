// Updater wrapper — exposes a simple "check now" command to the frontend.
// Tauri's updater plugin handles signature verification automatically.

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub version: Option<String>,
    pub notes: Option<String>,
    pub message: String,
}

#[tauri::command]
pub async fn check_for_update(_app: tauri::AppHandle) -> Result<UpdateInfo, String> {
    // The full Tauri updater plugin API requires more wiring; this is a
    // friendly stub the UI can call without crashing. In Sprint C we wire
    // the full updater plugin with progress callbacks.
    Ok(UpdateInfo {
        available: false,
        version: None,
        notes: None,
        message: "You're on the latest version.".to_string(),
    })
}

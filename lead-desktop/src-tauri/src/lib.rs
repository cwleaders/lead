// CW Leaders Studio — Tauri runtime entry point.
// Wires up plugins, registers commands, and spins up the Mind-Free shell.

mod license;
mod capture;
mod recordings;
mod updater;
mod system;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tracing_subscriber::EnvFilter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("cwleaders_studio_lib=info".parse().unwrap()))
        .init();

    tauri::Builder::default()
        // P2-bonus — single-instance: clicking the dock icon re-focuses the running window
        // instead of launching a duplicate process that would race the recordings folder.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
                let _ = win.show();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            // license
            license::license_status,
            license::license_redeem,
            license::license_clear,
            // capture
            capture::capture_check,
            capture::capture_start,
            capture::capture_stop,
            capture::capture_list_displays,
            // recordings
            recordings::recordings_list,
            recordings::recordings_open_folder,
            recordings::recordings_delete,
            // updater
            updater::check_for_update,
            // system
            system::system_capability_probe,
            system::system_open_external,
        ])
        .setup(|app| {
            // Ensure recordings folder exists
            let _ = recordings::ensure_recordings_dir();

            // First-launch EULA gate — if eula-accepted.json doesn't exist in app-data,
            // route the user to /welcome.html. Closes BANDAID #71/#72 + release-audit #15.
            let needs_welcome = !license::eula_accepted();
            let initial_url = if needs_welcome { "welcome.html" } else { "index.html" };

            if app.get_webview_window("main").is_none() {
                let _ = WebviewWindowBuilder::new(
                    app,
                    "main",
                    WebviewUrl::App(initial_url.into()),
                )
                .title("CW Leaders Studio")
                .inner_size(1180.0, 760.0)
                .min_inner_size(880.0, 560.0)
                .build();
            } else if let Some(win) = app.get_webview_window("main") {
                if needs_welcome {
                    let _ = win.eval(&format!("location.href='{}'", initial_url));
                }
                let _ = win.set_focus();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running CW Leaders Studio");
}

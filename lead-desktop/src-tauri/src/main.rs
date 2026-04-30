// CW Leaders Studio — desktop entry
// Prevents the additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    cwleaders_studio_lib::run()
}

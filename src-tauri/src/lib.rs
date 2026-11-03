//! AudioLab – Tauri desktop shell.
//!
//! The Angular frontend does all audio capture and signal processing inside the WebView.
//! This crate only hosts the window and exposes a deliberately small command surface:
//!
//! - [`platform`] – read-only information about the host for the status bar / About view
//!
//! New native features (file export, device enumeration fallbacks, …) must be added as
//! explicit commands behind a frontend adapter (`src/app/platform/`), never as broad plugins.

pub mod platform;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![platform::platform_info])
        .run(tauri::generate_context!())
        .expect("error while running AudioLab");
}

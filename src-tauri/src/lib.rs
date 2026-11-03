//! AudioLab – Tauri desktop shell.
//!
//! The Angular frontend does all audio capture and signal processing inside the WebView.
//! This crate hosts the window and exposes a deliberately small surface:
//!
//! - [`platform`]     – read-only host information for the status bar (command `platform_info`)
//! - [`permissions`]  – web permission policy: microphone yes, everything else no
//! - [`window_state`] – remembers window position/size (no plugin, no extra capability)
//! - [`export`]       – user-initiated file export through the native save dialog
//!
//! New native features (file export, …) must be added as explicit commands behind a frontend
//! adapter (`src/app/platform/`), never as broad plugins.

pub mod export;
pub mod permissions;
pub mod platform;
pub mod window_state;

use tauri::{
    App, AppHandle, Manager, PhysicalPosition, PhysicalSize, RunEvent, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};
use window_state::{Area, WindowGeometry};

const MAIN: &str = "main";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // dialog plugin is used from Rust only (export); the webview gets no dialog permission
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            platform::platform_info,
            export::export_file
        ])
        .setup(|app| {
            create_main_window(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building AudioLab")
        .run(|app, event| {
            if let RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { .. },
                ..
            } = &event
                && label == MAIN
            {
                save_window_state(app);
            }
        });
}

/// The main window is created here (not from `tauri.conf.json` directly, `create: false`) so the
/// permission policy can be attached before the webview exists.
fn create_main_window(app: &mut App) -> tauri::Result<()> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == MAIN)
        .cloned()
        .ok_or_else(|| tauri::Error::WindowNotFound)?;
    let min_size = (
        config.min_width.unwrap_or(0.0) as u32,
        config.min_height.unwrap_or(0.0) as u32,
    );
    let window = WebviewWindowBuilder::from_config(app.handle(), &config)?
        .visible(false)
        .on_permission_request(|_, kind| permissions::policy(kind))
        .build()?;

    #[cfg(target_os = "linux")]
    enable_media_stream(&window);

    restore_window_state(app.handle(), &window, min_size);
    window.show()?;
    Ok(())
}

/// WebKitGTK only exposes `getUserMedia` when media streams are enabled in its settings.
#[cfg(target_os = "linux")]
fn enable_media_stream(window: &WebviewWindow) {
    let _ = window.with_webview(|webview| {
        use webkit2gtk::{SettingsExt, WebViewExt};
        if let Some(settings) = webview.inner().settings() {
            settings.set_enable_media_stream(true);
        }
    });
}

fn state_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(window_state::FILE_NAME))
}

fn restore_window_state(app: &AppHandle, window: &WebviewWindow, min_size: (u32, u32)) {
    let Some(geometry) = state_path(app).and_then(|p| window_state::load(&p)) else {
        return;
    };
    let monitors: Vec<Area> = window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| Area {
            x: m.position().x,
            y: m.position().y,
            width: m.size().width,
            height: m.size().height,
        })
        .collect();
    if !window_state::is_visible(&geometry, &monitors, min_size) {
        return;
    }
    let _ = window.set_size(PhysicalSize::new(geometry.width, geometry.height));
    let _ = window.set_position(PhysicalPosition::new(geometry.x, geometry.y));
    if geometry.maximized {
        let _ = window.maximize();
    }
}

fn save_window_state(app: &AppHandle) {
    let (Some(window), Some(path)) = (app.get_webview_window(MAIN), state_path(app)) else {
        return;
    };
    let maximized = window.is_maximized().unwrap_or(false);
    // keep the last normal geometry when maximised
    if maximized && let Some(previous) = window_state::load(&path) {
        let _ = window_state::save(
            &path,
            &WindowGeometry {
                maximized: true,
                ..previous
            },
        );
        return;
    }
    if let (Ok(position), Ok(size)) = (window.outer_position(), window.inner_size()) {
        let _ = window_state::save(
            &path,
            &WindowGeometry {
                x: position.x,
                y: position.y,
                width: size.width,
                height: size.height,
                maximized,
            },
        );
    }
}

//! File export: the only way data leaves the app, and only on explicit user action.
//!
//! The frontend sends the bytes with a suggested file name; Rust opens the native save dialog and
//! writes exactly to the path the user picked. The webview never gets file-system or dialog
//! permissions of its own.

use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::DialogExt;

/// Header carrying the suggested file name (the body carries the raw bytes).
pub const NAME_HEADER: &str = "x-file-name";
/// Upper bound for one export (10 min of 48 kHz float stereo is ≈ 230 MB; keep headroom).
pub const MAX_BYTES: usize = 512 * 1024 * 1024;

/// Keeps a safe file name: no directories, no control or reserved characters, sensible length.
pub fn sanitize_file_name(name: &str) -> String {
    // last path component for both separators, independent of the platform the app runs on
    let base = name.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
                '_'
            } else {
                c
            }
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    let mut result: String = trimmed.chars().take(120).collect();
    if result.is_empty() {
        result = "export".into();
    }
    result
}

/// Extension filter for the dialog, from the suggested name.
fn filter_for(name: &str) -> Option<(&'static str, &'static [&'static str])> {
    match Path::new(name).extension().and_then(|e| e.to_str()) {
        Some("wav") => Some(("WAV audio", &["wav"])),
        Some("txt") => Some(("Text", &["txt"])),
        _ => None,
    }
}

/// Returns the saved path, or `None` when the user cancelled the dialog.
#[tauri::command]
pub async fn export_file<R: Runtime>(
    app: AppHandle<R>,
    request: Request<'_>,
) -> Result<Option<String>, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw bytes".into());
    };
    if bytes.len() > MAX_BYTES {
        return Err("file too large".into());
    }
    let suggested = request
        .headers()
        .get(NAME_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(sanitize_file_name)
        .unwrap_or_else(|| "export".into());

    let mut dialog = app.dialog().file().set_file_name(&suggested);
    if let Some((label, extensions)) = filter_for(&suggested) {
        dialog = dialog.add_filter(label, extensions);
    }
    let Some(choice) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path: PathBuf = choice.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_directories_and_reserved_characters() {
        assert_eq!(sanitize_file_name("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_file_name("C:\\temp\\a.wav"), "a.wav");
        assert_eq!(sanitize_file_name("dir/sub\\b.wav"), "b.wav");
        assert_eq!(sanitize_file_name("rec:1?.wav"), "rec_1_.wav");
        assert_eq!(sanitize_file_name("  ...  "), "export");
        assert_eq!(sanitize_file_name(""), "export");
        assert_eq!(sanitize_file_name(&"a".repeat(300)).len(), 120);
    }

    #[test]
    fn picks_a_filter_by_extension() {
        assert_eq!(filter_for("x.wav").map(|f| f.0), Some("WAV audio"));
        assert_eq!(filter_for("x.bin"), None);
    }
}

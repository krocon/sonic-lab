//! Web permission policy of the main webview (least privilege).
//!
//! Sonic Lab needs the microphone and nothing else. Without a handler the platform defaults differ:
//! wry grants *every* media capture request on macOS (camera included), WebView2 shows its own
//! prompt and WebKitGTK decides on its own. The policy below makes the behaviour explicit and equal:
//! microphone allowed (the page only asks after the user pressed Start; the OS still asks once on
//! macOS via `NSMicrophoneUsageDescription`), everything else denied.

use tauri::webview::{PermissionKind, PermissionResponse};

pub fn policy(kind: PermissionKind) -> PermissionResponse {
    match kind {
        PermissionKind::Microphone => PermissionResponse::Allow,
        _ => PermissionResponse::Deny,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed(kind: PermissionKind) -> bool {
        matches!(policy(kind), PermissionResponse::Allow)
    }

    #[test]
    fn only_the_microphone_is_allowed() {
        assert!(allowed(PermissionKind::Microphone));
        assert!(!allowed(PermissionKind::Camera));
        assert!(!allowed(PermissionKind::Geolocation));
        assert!(!allowed(PermissionKind::Notifications));
        assert!(!allowed(PermissionKind::ClipboardRead));
        assert!(!allowed(PermissionKind::DisplayCapture));
        assert!(!allowed(PermissionKind::Other));
    }
}

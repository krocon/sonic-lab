//! Host information for the frontend (no secrets, no paths, no audio data).

use serde::Serialize;

/// Serialised to the frontend as `PlatformInfo` (`src/app/platform/platform-info.ts`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    /// `std::env::consts::OS`, e.g. `macos`, `windows`, `linux`.
    pub os: &'static str,
    /// `std::env::consts::ARCH`, e.g. `aarch64`, `x86_64`.
    pub arch: &'static str,
    /// Version of the desktop app (from `Cargo.toml`).
    pub app_version: &'static str,
}

/// Pure helper so the values can be unit-tested without a Tauri runtime.
pub fn current() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        app_version: env!("CARGO_PKG_VERSION"),
    }
}

#[tauri::command]
pub fn platform_info() -> PlatformInfo {
    current()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_reports_non_empty_values() {
        let info = current();
        assert!(!info.os.is_empty());
        assert!(!info.arch.is_empty());
        assert_eq!(info.app_version, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn serialises_camel_case() {
        let json = serde_json::to_string(&current()).expect("serialisable");
        assert!(json.contains("\"appVersion\""));
    }
}

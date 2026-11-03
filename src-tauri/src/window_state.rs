//! Remembers the main window's position, size and maximised state between runs.
//!
//! Small and dependency-free on purpose (no window-state plugin, no extra capability): the state is
//! a JSON file in the app config directory, written atomically on close and validated against the
//! connected monitors on restore, so a window never reappears off-screen.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::Path;

pub const FILE_NAME: &str = "window-state.json";
/// A restored window must overlap a monitor by at least this many physical pixels in each axis.
const MIN_VISIBLE: i64 = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowGeometry {
    /// Outer position, physical pixels.
    pub x: i32,
    pub y: i32,
    /// Inner size, physical pixels.
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

/// A monitor's area in physical pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Area {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

fn overlap(a_start: i64, a_len: i64, b_start: i64, b_len: i64) -> i64 {
    (a_start + a_len).min(b_start + b_len) - a_start.max(b_start)
}

/// True if enough of the window is visible on one of the monitors and the size is sane.
pub fn is_visible(geometry: &WindowGeometry, monitors: &[Area], min_size: (u32, u32)) -> bool {
    if geometry.width < min_size.0 || geometry.height < min_size.1 {
        return false;
    }
    monitors.iter().any(|m| {
        let dx = overlap(
            geometry.x as i64,
            geometry.width as i64,
            m.x as i64,
            m.width as i64,
        );
        let dy = overlap(
            geometry.y as i64,
            geometry.height as i64,
            m.y as i64,
            m.height as i64,
        );
        dx >= MIN_VISIBLE && dy >= MIN_VISIBLE
    })
}

/// Reads the saved geometry; missing or broken files yield `None` (start with the defaults).
pub fn load(path: &Path) -> Option<WindowGeometry> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// Writes the geometry atomically (temp file + rename).
pub fn save(path: &Path, geometry: &WindowGeometry) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    let mut file = fs::File::create(&tmp)?;
    file.write_all(serde_json::to_string_pretty(geometry)?.as_bytes())?;
    file.sync_all()?;
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: Area = Area {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
    };

    fn geometry(x: i32, y: i32) -> WindowGeometry {
        WindowGeometry {
            x,
            y,
            width: 1200,
            height: 800,
            maximized: false,
        }
    }

    #[test]
    fn accepts_a_window_on_screen() {
        assert!(is_visible(&geometry(100, 100), &[SCREEN], (720, 480)));
    }

    #[test]
    fn rejects_a_window_off_screen_or_on_a_removed_monitor() {
        assert!(!is_visible(&geometry(3000, 100), &[SCREEN], (720, 480)));
        assert!(!is_visible(&geometry(1850, 100), &[SCREEN], (720, 480)));
        assert!(!is_visible(&geometry(100, 100), &[], (720, 480)));
    }

    #[test]
    fn accepts_a_window_on_a_secondary_monitor_left_of_the_primary() {
        let left = Area {
            x: -2560,
            y: 0,
            width: 2560,
            height: 1440,
        };
        assert!(is_visible(
            &geometry(-2000, 200),
            &[SCREEN, left],
            (720, 480)
        ));
    }

    #[test]
    fn rejects_too_small_sizes() {
        let mut g = geometry(100, 100);
        g.width = 200;
        assert!(!is_visible(&g, &[SCREEN], (720, 480)));
    }

    #[test]
    fn round_trips_through_a_file_and_ignores_broken_files() {
        let dir = std::env::temp_dir().join(format!("audiolab-ws-{}", std::process::id()));
        let path = dir.join(FILE_NAME);
        let g = geometry(10, 20);
        save(&path, &g).expect("save");
        assert_eq!(load(&path), Some(g));
        fs::write(&path, "{ not json").expect("write");
        assert_eq!(load(&path), None);
        assert_eq!(load(&dir.join("missing.json")), None);
        let _ = fs::remove_dir_all(dir);
    }
}

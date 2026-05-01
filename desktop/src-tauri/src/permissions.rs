use serde::Serialize;

#[derive(Debug, Serialize, Eq, PartialEq, Copy, Clone)]
#[serde(rename_all = "lowercase")]
pub enum ScreenRecordingState {
    /// macOS has granted permission to this binary.
    Granted,
    /// macOS has not granted permission. May be "not yet requested" or "denied" — the
    /// system makes no distinction visible to the app, so we treat them the same.
    Denied,
    /// We're not on macOS; permission is irrelevant.
    NotApplicable,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionStatus {
    /// True only on macOS — elsewhere the app doesn't need a permission gate.
    pub mac: bool,
    pub screen_recording: ScreenRecordingState,
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

pub fn check() -> PermissionStatus {
    #[cfg(target_os = "macos")]
    {
        let granted = unsafe { CGPreflightScreenCaptureAccess() };
        PermissionStatus {
            mac: true,
            screen_recording: if granted { ScreenRecordingState::Granted } else { ScreenRecordingState::Denied },
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        PermissionStatus {
            mac: false,
            screen_recording: ScreenRecordingState::NotApplicable,
        }
    }
}

/// Trigger the native macOS Screen Recording permission prompt.
/// On first call, shows the system dialog; on subsequent calls, just returns the current state.
/// On non-macOS, no-ops and returns true.
pub fn request_screen() -> bool {
    #[cfg(target_os = "macos")]
    { unsafe { CGRequestScreenCaptureAccess() } }
    #[cfg(not(target_os = "macos"))]
    { true }
}

/// Open System Settings → Privacy & Security → Screen & System Audio Recording.
/// On non-macOS, no-ops.
#[cfg(target_os = "macos")]
pub fn open_screen_settings() -> std::io::Result<()> {
    use std::process::Command;
    Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        .status()?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn open_screen_settings() -> std::io::Result<()> { Ok(()) }

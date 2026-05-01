use std::path::PathBuf;
use serde::Serialize;
use crate::errors::{AppError, AppResult};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlackHoleStatus {
    pub supported: bool,    // true on macOS, false elsewhere
    pub installed: bool,
}

#[cfg(target_os = "macos")]
const DRIVER_PATH: &str = "/Library/Audio/Plug-Ins/HAL/BlackHole2ch.driver";

// Pin to a known good release. The maintainer hosts pkgs on existential.audio (no
// auth required); GitHub releases for BlackHole don't carry .pkg assets.
// To bump: update both fields. Find the next version + sha at
// https://github.com/Homebrew/homebrew-cask/blob/master/Casks/b/blackhole-2ch.rb
#[cfg(target_os = "macos")]
const BLACKHOLE_PKG_URL: &str =
    "https://existential.audio/downloads/BlackHole2ch-0.6.1.pkg";

#[cfg(target_os = "macos")]
const BLACKHOLE_PKG_SHA256: &str =
    "c829afa041a9f6e1b369c01953c8f079740dd1f02421109855829edc0d3c1988";

pub fn check_status() -> BlackHoleStatus {
    #[cfg(target_os = "macos")]
    {
        BlackHoleStatus {
            supported: true,
            installed: PathBuf::from(DRIVER_PATH).exists(),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        BlackHoleStatus { supported: false, installed: false }
    }
}

#[cfg(target_os = "macos")]
pub async fn install() -> AppResult<()> {
    use std::fs;
    use std::process::Command;
    use std::io::Write;

    // 1. Download to a temp file
    let resp = reqwest::get(BLACKHOLE_PKG_URL).await?;
    if !resp.status().is_success() {
        return Err(AppError::Other(format!(
            "Could not download BlackHole installer (HTTP {})",
            resp.status()
        )));
    }
    let bytes = resp.bytes().await?;

    // Verify integrity against the same SHA the Homebrew cask uses.
    let actual = sha256_hex(&bytes);
    if actual != BLACKHOLE_PKG_SHA256 {
        return Err(AppError::Other(format!(
            "Downloaded BlackHole installer has unexpected hash. Expected {}, got {}. Refusing to install.",
            BLACKHOLE_PKG_SHA256, actual
        )));
    }

    let tmp = std::env::temp_dir().join("BlackHole2ch.pkg");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(&bytes)?;
    }

    // 2. Run via osascript with admin privileges (single native auth prompt)
    let script = format!(
        r#"do shell script "installer -pkg \"{}\" -target /" with administrator privileges with prompt "Utter needs your password to install BlackHole, the free audio driver for capturing meeting audio.""#,
        tmp.display()
    );
    let output = Command::new("osascript").arg("-e").arg(&script).output()?;

    // Best-effort cleanup; don't block on failures
    let _ = fs::remove_file(&tmp);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // The user cancelling the auth prompt yields exit code 1 with "User canceled."
        if stderr.contains("User canceled") || stderr.contains("(-128)") {
            return Err(AppError::Other("Installation cancelled.".to_string()));
        }
        return Err(AppError::Other(format!(
            "Installer failed: {}",
            stderr.trim()
        )));
    }

    // 3. Verify driver actually appeared (kernel may take a moment)
    for _ in 0..10 {
        if PathBuf::from(DRIVER_PATH).exists() { return Ok(()); }
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }
    Err(AppError::Other(
        "Installer ran but BlackHole driver not detected. You may need to restart your Mac."
            .to_string(),
    ))
}

#[cfg(not(target_os = "macos"))]
pub async fn install() -> AppResult<()> {
    Err(AppError::Other("BlackHole is only needed on macOS".to_string()))
}

#[cfg(target_os = "macos")]
fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(64);
    for b in digest.iter() {
        use std::fmt::Write;
        let _ = write!(out, "{:02x}", b);
    }
    out
}

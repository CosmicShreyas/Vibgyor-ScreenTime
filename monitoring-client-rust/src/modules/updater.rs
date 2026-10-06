//! GitHub-based OTA updater for the monitoring client.
//!
//! The updater checks GitHub Releases for a newer version, downloads a zip asset,
//! extracts the client executable, and hands off replacement to a small Windows
//! updater script after the current process exits.

use crate::modules::config::Config;
use crate::modules::error::{MonitoringError, Result};
use regex::Regex;
use reqwest::header::{ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::Deserialize;
use std::fs::{self, File};
use std::io::{self, Cursor};
use std::path::{Path, PathBuf};
use std::process::Command;
use tracing::{info, warn};
use zip::ZipArchive;

#[derive(Debug)]
pub struct UpdateResult {
    pub update_started: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    draft: bool,
    prerelease: bool,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize, Clone)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

pub struct OtaUpdater {
    client: reqwest::Client,
}

impl OtaUpdater {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()?;

        Ok(Self { client })
    }

    pub async fn check_and_apply_update(&self, config: &Config) -> Result<UpdateResult> {
        let current_version = env!("CARGO_PKG_VERSION").to_string();

        if !config.ota_enabled {
            return Ok(UpdateResult {
                update_started: false,
                current_version,
                latest_version: None,
            });
        }

        if config.ota_github_repo_url.trim().is_empty() {
            warn!("OTA is enabled but OTA_GITHUB_REPO_URL is empty; skipping update check");
            return Ok(UpdateResult {
                update_started: false,
                current_version,
                latest_version: None,
            });
        }

        // A previous interrupted handoff can leave a batch file and a staged
        // executable in the fixed staging directory. They are never needed by a
        // live client, so remove them before starting a new check.
        cleanup_staging_artifacts();

        let (owner, repo) = parse_repo_url(&config.ota_github_repo_url)?;
        let release = self.fetch_latest_release(&owner, &repo).await?;
        let latest_version = normalize_version(&release.tag_name);

        if !is_version_newer(&latest_version, &current_version) {
            return Ok(UpdateResult {
                update_started: false,
                current_version,
                latest_version: Some(latest_version),
            });
        }

        let current_exe = std::env::current_exe().map_err(|e| {
            MonitoringError::Platform(format!("Unable to resolve current executable: {}", e))
        })?;
        let asset = select_release_asset(&release.assets, config)?;
        let zip_bytes = self.download_asset(&asset).await?;
        let staged_exe = extract_executable_from_zip(&zip_bytes, config)?;
        let staged_watchdog = extract_watchdog_from_zip(&zip_bytes)?;

        // GitHub's release tag may be newer while its zip still contains the
        // exact old binary. Applying that asset creates an endless download /
        // exit loop. Reject an identical payload and keep the live client up.
        if files_are_identical(&current_exe, &staged_exe)? {
            warn!(
                "OTA release {} contains the same client binary as this installation; skipping it",
                latest_version
            );
            let _ = fs::remove_file(&staged_exe);
            if let Some(staged_watchdog) = staged_watchdog {
                let _ = fs::remove_file(staged_watchdog);
            }
            return Ok(UpdateResult {
                update_started: false,
                current_version,
                latest_version: Some(latest_version),
            });
        }

        launch_windows_updater(
            &current_exe,
            &staged_exe,
            staged_watchdog.as_deref(),
            &latest_version,
        )?;

        Ok(UpdateResult {
            update_started: true,
            current_version,
            latest_version: Some(latest_version),
        })
    }

    async fn fetch_latest_release(&self, owner: &str, repo: &str) -> Result<GithubRelease> {
        let url = format!("https://api.github.com/repos/{owner}/{repo}/releases/latest");
        let mut request = self
            .client
            .get(url)
            .header(USER_AGENT, "VibgyorSeek-Monitoring-Client-OTA")
            .header(ACCEPT, "application/vnd.github+json");

        if let Ok(token) = std::env::var("GITHUB_TOKEN") {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                request = request.header(AUTHORIZATION, format!("Bearer {}", trimmed));
            }
        }

        let response = request.send().await?.error_for_status()?;
        let release: GithubRelease = response.json().await?;

        if release.draft {
            return Err(MonitoringError::Config(
                "Latest GitHub release is still a draft".to_string(),
            ));
        }

        if release.prerelease {
            warn!("Latest GitHub release is marked as prerelease; it will still be used");
        }

        Ok(release)
    }

    async fn download_asset(&self, asset: &GithubAsset) -> Result<Vec<u8>> {
        info!("Downloading OTA asset: {}", asset.name);

        let response = self
            .client
            .get(&asset.browser_download_url)
            .header(USER_AGENT, "VibgyorSeek-Monitoring-Client-OTA")
            .send()
            .await?
            .error_for_status()?;

        let bytes = response.bytes().await?;
        Ok(bytes.to_vec())
    }
}

fn parse_repo_url(repo_url: &str) -> Result<(String, String)> {
    let trimmed = repo_url.trim().trim_end_matches('/');
    let re = Regex::new(r"^https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?$").map_err(|e| {
        MonitoringError::Config(format!("Failed to build GitHub repo regex: {}", e))
    })?;

    if let Some(captures) = re.captures(trimmed) {
        let owner = captures
            .get(1)
            .map(|m| m.as_str().to_string())
            .ok_or_else(|| MonitoringError::Config("Invalid GitHub repository URL".to_string()))?;
        let repo = captures
            .get(2)
            .map(|m| m.as_str().to_string())
            .ok_or_else(|| MonitoringError::Config("Invalid GitHub repository URL".to_string()))?;

        return Ok((owner, repo));
    }

    Err(MonitoringError::Config(format!(
        "Unsupported OTA_GITHUB_REPO_URL format: {}",
        repo_url
    )))
}

fn normalize_version(version: &str) -> String {
    version.trim().trim_start_matches(['v', 'V']).to_string()
}

fn is_version_newer(latest: &str, current: &str) -> bool {
    let latest_parts = parse_version_parts(latest);
    let current_parts = parse_version_parts(current);
    latest_parts > current_parts
}

fn parse_version_parts(version: &str) -> Vec<u32> {
    let core = version
        .trim()
        .trim_start_matches(['v', 'V'])
        .split('-')
        .next()
        .unwrap_or(version);

    core.split('.')
        .map(|part| part.parse::<u32>().unwrap_or(0))
        .collect()
}

fn select_release_asset<'a>(assets: &'a [GithubAsset], config: &Config) -> Result<&'a GithubAsset> {
    if let Some(expected) = config.ota_release_asset_name.as_ref() {
        if let Some(asset) = assets
            .iter()
            .find(|asset| asset.name.eq_ignore_ascii_case(expected))
        {
            return Ok(asset);
        }

        return Err(MonitoringError::Config(format!(
            "Configured OTA_RELEASE_ASSET_NAME '{}' was not found in the latest GitHub release",
            expected
        )));
    }

    assets
        .iter()
        .find(|asset| asset.name.to_ascii_lowercase().ends_with(".zip"))
        .ok_or_else(|| {
            MonitoringError::Config(
                "No .zip asset was found in the latest GitHub release".to_string(),
            )
        })
}

fn staging_dir() -> PathBuf {
    std::env::temp_dir().join("vibgyorseek-ota")
}

/// Remove only updater-generated files from a prior failed or interrupted
/// handoff. The directory itself is retained so a restricted user profile does
/// not need to create it repeatedly.
fn cleanup_staging_artifacts() {
    let directory = staging_dir();
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.eq_ignore_ascii_case("apply_update.bat")
            || name.to_ascii_lowercase().starts_with("next-")
        {
            let _ = fs::remove_file(entry.path());
        }
    }
}

fn files_are_identical(first: &Path, second: &Path) -> Result<bool> {
    if fs::metadata(first)?.len() != fs::metadata(second)?.len() {
        return Ok(false);
    }

    let mut first = io::BufReader::new(File::open(first)?);
    let mut second = io::BufReader::new(File::open(second)?);
    let mut first_buffer = [0u8; 64 * 1024];
    let mut second_buffer = [0u8; 64 * 1024];

    loop {
        let first_read = io::Read::read(&mut first, &mut first_buffer)?;
        let second_read = io::Read::read(&mut second, &mut second_buffer)?;
        if first_read != second_read || first_buffer[..first_read] != second_buffer[..second_read] {
            return Ok(false);
        }
        if first_read == 0 {
            return Ok(true);
        }
    }
}

fn extract_executable_from_zip(zip_bytes: &[u8], config: &Config) -> Result<PathBuf> {
    let cursor = Cursor::new(zip_bytes);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| MonitoringError::Config(format!("Failed to open OTA zip archive: {}", e)))?;

    let configured_name = config
        .ota_executable_name
        .as_ref()
        .map(|name| name.trim().to_ascii_lowercase())
        .filter(|name| !name.is_empty());

    let mut matched_entry_index: Option<usize> = None;

    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(zip_to_error)?;
        let name = file.name().replace('\\', "/");
        let file_name = Path::new(&name)
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_default();
        let lower_file_name = file_name.to_ascii_lowercase();

        let name_matches = match configured_name.as_ref() {
            Some(expected) => lower_file_name == *expected,
            None => lower_file_name.ends_with(".exe"),
        };

        if name_matches {
            matched_entry_index = Some(i);
            break;
        }
    }

    let index = matched_entry_index.ok_or_else(|| {
        MonitoringError::Config(
            "Could not find the client executable inside the GitHub release zip".to_string(),
        )
    })?;

    let mut zip_file = archive.by_index(index).map_err(zip_to_error)?;
    let executable_name = Path::new(zip_file.name())
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "smc.exe".to_string());

    let staging_dir = staging_dir();
    fs::create_dir_all(&staging_dir)?;

    let staged_executable = staging_dir.join(format!("next-{}", executable_name));
    let mut output = File::create(&staged_executable)?;
    io::copy(&mut zip_file, &mut output)?;

    Ok(staged_executable)
}

/// Stage the optional companion watchdog alongside the main client. Older
/// releases without this file remain compatible and simply retain the existing
/// watchdog installation.
fn extract_watchdog_from_zip(zip_bytes: &[u8]) -> Result<Option<PathBuf>> {
    const WATCHDOG_FILENAME: &str = "swcd.exe";

    let cursor = Cursor::new(zip_bytes);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| MonitoringError::Config(format!("Failed to open OTA zip archive: {}", e)))?;

    let index = (0..archive.len()).find(|index| {
        archive
            .by_index(*index)
            .ok()
            .and_then(|file| {
                Path::new(file.name()).file_name().map(|name| {
                    name.to_string_lossy()
                        .eq_ignore_ascii_case(WATCHDOG_FILENAME)
                })
            })
            .unwrap_or(false)
    });

    let Some(index) = index else {
        return Ok(None);
    };

    let mut zip_file = archive.by_index(index).map_err(zip_to_error)?;
    let directory = staging_dir();
    fs::create_dir_all(&directory)?;
    let staged_watchdog = directory.join(format!("next-{}", WATCHDOG_FILENAME));
    let mut output = File::create(&staged_watchdog)?;
    io::copy(&mut zip_file, &mut output)?;
    Ok(Some(staged_watchdog))
}

#[cfg(target_os = "windows")]
fn launch_windows_updater(
    current_exe: &Path,
    staged_exe: &Path,
    staged_watchdog: Option<&Path>,
    latest_version: &str,
) -> Result<()> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let staging_dir = staging_dir();
    fs::create_dir_all(&staging_dir)?;

    let script_path = staging_dir.join("apply_update.bat");
    let target = current_exe.to_string_lossy().replace('"', "\"\"");
    let source = staged_exe.to_string_lossy().replace('"', "\"\"");
    let watchdog_target = current_exe
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("swcd.exe")
        .to_string_lossy()
        .replace('"', "\"\"");
    let watchdog_source = staged_watchdog
        .map(|path| path.to_string_lossy().replace('"', "\"\""))
        .unwrap_or_default();
    let version = latest_version.replace('"', "\"\"");
    let parent_pid = std::process::id();
    let script_path_string = script_path.to_string_lossy().to_string();

    let script = format!(
        "@echo off\r\n\
setlocal\r\n\
set \"SOURCE={source}\"\r\n\
set \"TARGET={target}\"\r\n\
set \"WATCHDOG_SOURCE={watchdog_source}\"\r\n\
set \"WATCHDOG_TARGET={watchdog_target}\"\r\n\
set \"PARENT_PID={parent_pid}\"\r\n\
set /a WAIT_TRIES=0\r\n\
:wait_for_parent\r\n\
tasklist /FI \"PID eq %PARENT_PID%\" /NH | findstr /R /C:\"^[^ ]*[ ]*%PARENT_PID% \" >nul\r\n\
if not errorlevel 1 (\r\n\
  set /a WAIT_TRIES+=1\r\n\
  if %WAIT_TRIES% GEQ 90 goto fallback\r\n\
  timeout /t 1 /nobreak >nul\r\n\
  goto wait_for_parent\r\n\
)\r\n\
for /L %%i in (1,1,30) do (\r\n\
  copy /Y \"%SOURCE%\" \"%TARGET%\" >nul 2>&1 && goto launch\r\n\
  timeout /t 2 /nobreak >nul\r\n\
)\r\n\
goto fallback\r\n\
:launch\r\n\
if not \"%WATCHDOG_SOURCE%\"==\"\" (\r\n\
  for /L %%i in (1,1,30) do (\r\n\
    copy /Y \"%WATCHDOG_SOURCE%\" \"%WATCHDOG_TARGET%\" >nul 2>&1 && goto launch_client\r\n\
    timeout /t 2 /nobreak >nul\r\n\
  )\r\n\
)\r\n\
:launch_client\r\n\
start \"\" \"%TARGET%\"\r\n\
goto cleanup\r\n\
:fallback\r\n\
rem Keep the existing client available if replacement cannot be completed.\r\n\
start \"\" \"%TARGET%\"\r\n\
:cleanup\r\n\
del /f /q \"%SOURCE%\" >nul 2>&1\r\n\
if not \"%WATCHDOG_SOURCE%\"==\"\" del /f /q \"%WATCHDOG_SOURCE%\" >nul 2>&1\r\n\
del /f /q \"%~f0\" >nul 2>&1\r\n"
    );

    fs::write(&script_path, script)?;

    info!(
        "OTA update prepared. Current executable will be replaced with version {} on exit",
        version
    );

    Command::new("cmd")
        .args(["/C", script_path_string.as_str()])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| {
            MonitoringError::Platform(format!("Failed to launch OTA updater script: {}", e))
        })?;

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn launch_windows_updater(
    _current_exe: &Path,
    _staged_exe: &Path,
    _staged_watchdog: Option<&Path>,
    _latest_version: &str,
) -> Result<()> {
    Err(MonitoringError::Platform(
        "GitHub OTA updates are currently implemented for Windows only".to_string(),
    ))
}

fn zip_to_error(error: zip::result::ZipError) -> MonitoringError {
    MonitoringError::Config(format!("Zip archive error: {}", error))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_repo_url() {
        let (owner, repo) =
            parse_repo_url("https://github.com/CosmicShreyas/Vibgyor-Screentime").unwrap();
        assert_eq!(owner, "CosmicShreyas");
        assert_eq!(repo, "Vibgyor-Screentime");
    }

    #[test]
    fn test_parse_repo_url_with_git_suffix() {
        let (owner, repo) =
            parse_repo_url("https://github.com/CosmicShreyas/Vibgyor-Screentime.git").unwrap();
        assert_eq!(owner, "CosmicShreyas");
        assert_eq!(repo, "Vibgyor-Screentime");
    }

    #[test]
    fn test_version_comparison() {
        assert!(is_version_newer("1.0.1", "1.0.0"));
        assert!(is_version_newer("1.2.0", "1.1.9"));
        assert!(is_version_newer("2.0.0", "1.9.9"));
        assert!(!is_version_newer("1.0.0", "1.0.0"));
        assert!(!is_version_newer("1.0.0", "1.0.1"));
        assert!(is_version_newer("v1.0.2", "1.0.1"));
    }
}

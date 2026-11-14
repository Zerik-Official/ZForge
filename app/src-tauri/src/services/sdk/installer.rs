//! Download and installation of SDK releases.
//!
//! The release zip is downloaded next to the installations, extracted into a
//! staging folder and validated; only then are older installations replaced,
//! so a failed update never breaks a working SDK.

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::services::sdk::SDK_PREFIX;
use crate::services::sdk::installation::{self, Installation};
use crate::services::sdk::release::{ReleaseClient, SdkRelease};

const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);
const STAGING_DIR: &str = ".staging";
const DEVELOPER_ONLY_FILES: &[&str] = &["wowsdk_cli.py", "requirements.txt"];

/// Download progress reported to the frontend.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DownloadProgress {
    /// Completion percentage (0–100).
    pub percent: u8,
    /// Bytes received so far.
    pub downloaded: u64,
    /// Total bytes, or `0` when unknown.
    pub total: u64,
    /// Average speed in bytes per second.
    pub speed: f64,
    /// Estimated seconds remaining.
    pub eta: f64,
    /// Version being downloaded.
    pub version: String,
}

impl DownloadProgress {
    fn new(version: &str, downloaded: u64, total: u64, elapsed: Duration) -> Self {
        let seconds = elapsed.as_secs_f64().max(0.001);
        let speed = downloaded as f64 / seconds;
        let remaining = total.saturating_sub(downloaded) as f64;
        let percent = (downloaded.min(total).saturating_mul(100))
            .checked_div(total)
            .map_or(0, |percent| u8::try_from(percent).unwrap_or(100));
        Self {
            percent,
            downloaded,
            total,
            speed,
            eta: if speed > 0.0 { remaining / speed } else { 0.0 },
            version: version.to_owned(),
        }
    }
}

/// Guarantees a single installation at a time.
#[derive(Debug, Default)]
pub struct SdkInstaller {
    busy: AtomicBool,
}

/// Releases the installer's busy flag when dropped.
struct BusyGuard<'a>(&'a AtomicBool);

impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

impl SdkInstaller {
    /// Whether an installation is running.
    pub fn is_busy(&self) -> bool {
        self.busy.load(Ordering::Acquire)
    }

    /// Download the latest release and install it, replacing older versions.
    ///
    /// # Errors
    ///
    /// Returns [`AppError::SdkInstallInProgress`] when another installation is
    /// running, or fails when the download, extraction or validation fails.
    pub async fn install_latest(
        &self,
        releases: &ReleaseClient,
        tools_dir: &Path,
        mut on_progress: impl FnMut(DownloadProgress) + Send,
    ) -> AppResult<Installation> {
        if self
            .busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Err(AppError::SdkInstallInProgress);
        }
        let _guard = BusyGuard(&self.busy);

        let release = releases.latest().await?;
        fs::create_dir_all(tools_dir)?;
        let archive = tools_dir.join(format!(".{SDK_PREFIX}v{}.zip.part", release.version));
        tracing::info!(version = %release.version, "Downloading SDK");

        let result = async {
            download(releases.http(), &release, &archive, &mut on_progress).await?;
            let tools_dir = tools_dir.to_path_buf();
            let archive = archive.clone();
            let version = release.version.clone();
            tauri::async_runtime::spawn_blocking(move || activate(&archive, &tools_dir, &version))
                .await
                .map_err(|error| AppError::BackgroundTask(error.to_string()))?
        }
        .await;

        if let Err(error) = fs::remove_file(&archive)
            && error.kind() != std::io::ErrorKind::NotFound
        {
            tracing::warn!(%error, "Could not delete the downloaded SDK archive");
        }
        match &result {
            Ok(installation) => {
                tracing::info!(path = %installation.path.display(), "SDK installed");
            }
            Err(error) => tracing::error!(%error, "SDK installation failed"),
        }
        result
    }
}

async fn download(
    http: &reqwest::Client,
    release: &SdkRelease,
    destination: &Path,
    on_progress: &mut (impl FnMut(DownloadProgress) + Send),
) -> AppResult<()> {
    let mut response = http
        .get(&release.browser_download_url)
        .timeout(DOWNLOAD_TIMEOUT)
        .send()
        .await?
        .error_for_status()?;
    let total = response.content_length().or(release.size).unwrap_or(0);
    let mut file = File::create(destination)?;
    let started = Instant::now();
    let mut last_report = started;
    let mut downloaded: u64 = 0;

    while let Some(chunk) = response.chunk().await? {
        file.write_all(&chunk)?;
        downloaded += chunk.len() as u64;
        if last_report.elapsed() >= PROGRESS_INTERVAL {
            last_report = Instant::now();
            on_progress(DownloadProgress::new(
                &release.version,
                downloaded,
                total,
                started.elapsed(),
            ));
        }
    }
    file.flush()?;
    let total = if total == 0 { downloaded } else { total };
    on_progress(DownloadProgress::new(
        &release.version,
        total,
        total,
        started.elapsed(),
    ));
    Ok(())
}

/// Find the SDK root inside the extracted staging folder.
fn extracted_root(staging: &Path, version: &str) -> AppResult<PathBuf> {
    let expected = staging.join(format!("{SDK_PREFIX}v{version}"));
    if expected.is_dir() {
        return Ok(expected);
    }
    for entry in fs::read_dir(staging)? {
        let path = entry?.path();
        let is_sdk_folder = path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with(SDK_PREFIX));
        if path.is_dir() && is_sdk_folder {
            return Ok(path);
        }
    }
    Ok(staging.to_path_buf())
}

/// Extract the archive, validate it and replace older installations.
fn activate(archive: &Path, tools_dir: &Path, version: &str) -> AppResult<Installation> {
    let staging = tools_dir.join(STAGING_DIR);
    if staging.exists() {
        fs::remove_dir_all(&staging)?;
    }
    fs::create_dir_all(&staging)?;
    zip::ZipArchive::new(File::open(archive)?)?.extract(&staging)?;

    let root = extracted_root(&staging, version)?;
    for name in DEVELOPER_ONLY_FILES {
        let path = root.join(name);
        if path.is_file() {
            fs::remove_file(path)?;
        }
    }
    let candidate = Installation {
        path: root.clone(),
        version: version.to_owned(),
    };
    let missing = candidate.missing_files();
    if !missing.is_empty() {
        fs::remove_dir_all(&staging)?;
        return Err(AppError::SdkIncomplete { missing });
    }

    for old in installation::list(tools_dir)? {
        fs::remove_dir_all(&old.path)?;
    }
    let destination = tools_dir.join(format!("{SDK_PREFIX}v{version}"));
    fs::rename(&root, &destination)?;
    if staging.exists() {
        fs::remove_dir_all(&staging)?;
    }
    Ok(Installation {
        path: destination,
        version: version.to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use zip::write::SimpleFileOptions;

    use super::*;
    use crate::services::sdk::installation::REQUIRED_BINARIES;
    use crate::services::sdk::installation::tests::create;

    fn write_archive(path: &Path, files: &[&str]) -> AppResult<()> {
        let mut writer = zip::ZipWriter::new(File::create(path)?);
        for name in files {
            writer.start_file(*name, SimpleFileOptions::default())?;
            writer.write_all(b"content")?;
        }
        writer.finish()?;
        Ok(())
    }

    #[test]
    fn activates_a_valid_archive_and_replaces_old_versions() -> AppResult<()> {
        let directory = tempfile::tempdir()?;
        let tools = directory.path();
        create(tools, "1.0.0", true)?;
        let archive = tools.join("sdk.zip");
        let mut files: Vec<String> = REQUIRED_BINARIES
            .iter()
            .map(|name| format!("WoWControlSDK-v2.0.0/binaries/{name}"))
            .collect();
        files.push("WoWControlSDK-v2.0.0/wowsdk_cli.py".to_owned());
        write_archive(
            &archive,
            &files.iter().map(String::as_str).collect::<Vec<_>>(),
        )?;

        let installed = activate(&archive, tools, "2.0.0")?;
        assert!(installed.is_valid());
        assert!(!installed.path.join("wowsdk_cli.py").exists());
        let versions: Vec<String> = installation::list(tools)?
            .into_iter()
            .map(|installation| installation.version)
            .collect();
        assert_eq!(versions, ["2.0.0"]);
        assert!(!tools.join(STAGING_DIR).exists());
        Ok(())
    }

    #[test]
    fn keeps_the_working_sdk_when_the_archive_is_incomplete() -> AppResult<()> {
        let directory = tempfile::tempdir()?;
        let tools = directory.path();
        create(tools, "1.0.0", true)?;
        let archive = tools.join("sdk.zip");
        write_archive(&archive, &["WoWControlSDK-v2.0.0/readme.txt"])?;

        assert!(matches!(
            activate(&archive, tools, "2.0.0"),
            Err(AppError::SdkIncomplete { .. })
        ));
        let remaining = installation::find_valid(tools)?;
        assert_eq!(
            remaining.map(|installation| installation.version),
            Some("1.0.0".to_owned())
        );
        Ok(())
    }

    #[test]
    fn computes_progress() {
        let progress = DownloadProgress::new("1.0.0", 50, 200, Duration::from_secs(1));
        assert_eq!(progress.percent, 25);
        assert!((progress.speed - 50.0).abs() < f64::EPSILON);
        assert!((progress.eta - 3.0).abs() < f64::EPSILON);
    }
}

//! Media downloaded from the assets CDN into `<app data>/resources`.
//!
//! The repository does not ship heavy or third-party media. On boot the launcher downloads
//! the files that are missing, so the UI still has its videos, portraits, class icons and
//! logos without an internet connection afterwards. A failed download never blocks the boot.
//!
//! Layout of the folder:
//!
//! ```text
//! resources/
//! ├── videos/                 background videos of the games
//! ├── characters/
//! │   ├── portraits/          <race>-<gender>.webp and unknown.webp
//! │   ├── toasts/             PNG copies of the portraits for Windows notifications
//! │   └── classes/            <class id>.jpg
//! ├── cores/                  logos of the server cores
//! └── loading-screens/        loading screen used by the Rich Presence preview
//! ```

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::error::AppResult;

/// Base address of the assets CDN.
pub const CDN_BASE_URL: &str = "https://cdn.zerikapi.site/wow-assets";

/// Time limit of a whole file download.
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(120);

/// Time limit of the size request sent before downloading.
const HEAD_TIMEOUT: Duration = Duration::from_secs(10);

/// Minimum time between two progress reports.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(120);

/// Race ids that have a portrait.
const PORTRAIT_RACES: [u32; 10] = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11];

/// Class ids and the name of their icon on the CDN.
const CLASSES: [(u32, &str); 10] = [
    (1, "warrior"),
    (2, "paladin"),
    (3, "hunter"),
    (4, "rogue"),
    (5, "priest"),
    (6, "deathknight"),
    (7, "shaman"),
    (8, "mage"),
    (9, "warlock"),
    (11, "druid"),
];

/// Background videos, by file name.
pub const VIDEOS: [&str; 5] = [
    "wow-classic-portal.mp4",
    "wow-bc-dark-portal.mp4",
    "wow-lich-king-sword.mp4",
    "wow-shadowlands-shattered-sky.mp4",
    "wow-teldrassil-burning.mp4",
];

/// A file kept in the resources folder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResourceFile {
    /// Path inside the resources folder, with forward slashes.
    pub path: String,
    /// Address it is downloaded from.
    pub url: String,
}

impl ResourceFile {
    fn new(path: String, cdn_path: &str) -> Self {
        Self {
            path,
            url: format!("{CDN_BASE_URL}/{cdn_path}"),
        }
    }
}

/// Faction folder of a race portrait on the CDN.
fn faction(race: u32) -> &'static str {
    if matches!(race, 1 | 3 | 4 | 7 | 11) {
        "alliance"
    } else {
        "horde"
    }
}

/// Every file the launcher keeps in the resources folder.
pub fn manifest() -> Vec<ResourceFile> {
    let mut files: Vec<ResourceFile> = VIDEOS
        .iter()
        .map(|name| {
            ResourceFile::new(
                format!("videos/{name}"),
                &format!("games-animated-backgrounds/{name}"),
            )
        })
        .collect();
    for race in PORTRAIT_RACES {
        for gender in [0, 1] {
            let name = format!("{race}-{gender}.webp");
            files.push(ResourceFile::new(
                format!("characters/portraits/{name}"),
                &format!("ui/classes/{}/{name}", faction(race)),
            ));
        }
    }
    files.push(ResourceFile::new(
        "characters/portraits/unknown.webp".to_owned(),
        "ui/classes/unknown.webp",
    ));
    for (id, name) in CLASSES {
        files.push(ResourceFile::new(
            format!("characters/classes/{id}.jpg"),
            &format!("icons/large/class_{name}.jpg"),
        ));
    }
    for core in ["azeroth-core.png", "trinity-core.png"] {
        files.push(ResourceFile::new(
            format!("cores/{core}"),
            &format!("wow-server-logos/cores/{core}"),
        ));
    }
    files.push(ResourceFile::new(
        "loading-screens/eastern-kingdom.png".to_owned(),
        "loading-screens/eastern-kingdom.png",
    ));
    files
}

/// Progress of the resource downloads.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourcesProgress {
    /// Files downloaded or failed so far.
    pub files_done: usize,
    /// Files that were missing when the check started.
    pub files_total: usize,
    /// Bytes downloaded so far.
    pub downloaded: u64,
    /// Bytes of every missing file, as far as the server reported them.
    pub total: u64,
    /// Average download speed.
    pub bytes_per_second: u64,
    /// Path of the file being downloaded.
    pub current: String,
}

/// Outcome of [`ensure`].
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ResourcesReport {
    /// Files downloaded in this run.
    pub downloaded: usize,
    /// Files that could not be downloaded.
    pub failed: usize,
}

/// Files of the manifest that are not in the resources folder yet.
pub fn missing(root: &Path) -> Vec<ResourceFile> {
    manifest()
        .into_iter()
        .filter(|file| !root.join(&file.path).is_file())
        .collect()
}

/// Download the missing files, reporting the progress. Failures are logged and skipped.
///
/// # Errors
///
/// Returns an error only when the resources folder cannot be created.
pub async fn ensure(
    http: &reqwest::Client,
    root: &Path,
    mut on_progress: impl FnMut(&ResourcesProgress) + Send,
) -> AppResult<ResourcesReport> {
    let pending = missing(root);
    let mut report = ResourcesReport::default();
    if pending.is_empty() {
        return Ok(report);
    }
    fs::create_dir_all(root)?;

    let mut progress = ResourcesProgress {
        files_total: pending.len(),
        ..ResourcesProgress::default()
    };
    for file in &pending {
        progress.total += remote_size(http, &file.url).await.unwrap_or(0);
    }
    on_progress(&progress);

    let started = Instant::now();
    for file in &pending {
        progress.current.clone_from(&file.path);
        let destination = root.join(&file.path);
        match download(
            http,
            file,
            &destination,
            started,
            &mut progress,
            &mut on_progress,
        )
        .await
        {
            Ok(()) => report.downloaded += 1,
            Err(error) => {
                report.failed += 1;
                tracing::warn!(path = %file.path, %error, "Could not download a resource");
            }
        }
        progress.files_done += 1;
        on_progress(&progress);
    }
    tracing::info!(
        downloaded = report.downloaded,
        failed = report.failed,
        "Resources checked"
    );
    Ok(report)
}

async fn remote_size(http: &reqwest::Client, url: &str) -> Option<u64> {
    let response = http
        .head(url)
        .timeout(HEAD_TIMEOUT)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    response.content_length()
}

async fn download(
    http: &reqwest::Client,
    file: &ResourceFile,
    destination: &Path,
    started: Instant,
    progress: &mut ResourcesProgress,
    on_progress: &mut (impl FnMut(&ResourcesProgress) + Send),
) -> AppResult<()> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    let partial = partial_path(destination);
    let result = async {
        let mut response = http
            .get(&file.url)
            .timeout(DOWNLOAD_TIMEOUT)
            .send()
            .await?
            .error_for_status()?;
        let mut output = File::create(&partial)?;
        let mut last_report = Instant::now();
        while let Some(chunk) = response.chunk().await? {
            output.write_all(&chunk)?;
            progress.downloaded += chunk.len() as u64;
            progress.total = progress.total.max(progress.downloaded);
            if last_report.elapsed() >= PROGRESS_INTERVAL {
                last_report = Instant::now();
                progress.bytes_per_second = speed(progress.downloaded, started.elapsed());
                on_progress(progress);
            }
        }
        output.flush()?;
        drop(output);
        fs::rename(&partial, destination)?;
        progress.bytes_per_second = speed(progress.downloaded, started.elapsed());
        AppResult::Ok(())
    }
    .await;
    if result.is_err() {
        let _ = fs::remove_file(&partial);
    }
    result
}

/// PNG copy of a downloaded race portrait for Windows notifications, which do not show WebP.
/// The copy is made the first time and kept in `characters/toasts`.
pub fn toast_portrait(root: &Path, race: u32, gender: u32) -> Option<PathBuf> {
    if !PORTRAIT_RACES.contains(&race) || gender > 1 {
        return None;
    }
    let name = format!("{race}-{gender}");
    let png = root.join("characters/toasts").join(format!("{name}.png"));
    if png.is_file() {
        return Some(png);
    }
    let source = root
        .join("characters/portraits")
        .join(format!("{name}.webp"));
    let converted = image::open(&source)
        .map_err(|error| error.to_string())
        .and_then(|portrait| {
            if let Some(parent) = png.parent() {
                fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            portrait
                .save_with_format(&png, image::ImageFormat::Png)
                .map_err(|error| error.to_string())
        });
    match converted {
        Ok(()) => Some(png),
        Err(error) => {
            tracing::debug!(%error, portrait = %source.display(), "Could not prepare a notification portrait");
            None
        }
    }
}

fn partial_path(destination: &Path) -> PathBuf {
    let mut name = destination.as_os_str().to_owned();
    name.push(".part");
    PathBuf::from(name)
}

fn speed(bytes: u64, elapsed: Duration) -> u64 {
    let millis = u64::try_from(elapsed.as_millis())
        .unwrap_or(u64::MAX)
        .max(1);
    bytes.saturating_mul(1000) / millis
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_every_resource_once_with_cdn_addresses() {
        let files = manifest();
        assert_eq!(files.len(), 5 + 21 + 10 + 2 + 1);
        let mut paths: Vec<&str> = files.iter().map(|file| file.path.as_str()).collect();
        paths.sort_unstable();
        paths.dedup();
        assert_eq!(paths.len(), files.len());
        assert!(
            files
                .iter()
                .any(|file| file.path == "characters/portraits/11-1.webp"
                    && file.url.ends_with("/ui/classes/alliance/11-1.webp"))
        );
        assert!(
            files
                .iter()
                .any(|file| file.path == "characters/portraits/10-0.webp"
                    && file.url.ends_with("/ui/classes/horde/10-0.webp"))
        );
    }

    #[test]
    fn reports_only_missing_files() -> AppResult<()> {
        let directory = tempfile::tempdir()?;
        let root = directory.path();
        let before = missing(root).len();
        fs::create_dir_all(root.join("videos"))?;
        fs::write(root.join("videos/wow-classic-portal.mp4"), b"video")?;
        assert_eq!(missing(root).len(), before - 1);
        Ok(())
    }

    #[test]
    fn computes_the_speed() {
        assert_eq!(speed(2_000, Duration::from_secs(2)), 1_000);
        assert_eq!(speed(10, Duration::ZERO), 10_000);
    }
}

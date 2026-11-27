//! Integrity of the installed SDK: its version must be a published release and its
//! binaries must match the SHA-256 hashes of that release's `manifest.json`.
//!
//! The manifest is read from GitHub and kept in `tools/.manifests`, so a check without an
//! internet connection still compares with the last manifest read. When neither is
//! available the result is unknown and the SDK is not blocked.

use std::collections::{BTreeMap, HashMap};
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::services::sdk::SDK_REPOSITORY;
use crate::services::sdk::installation::{Installation, REQUIRED_BINARIES};

/// Time limit of the manifest request.
const MANIFEST_TIMEOUT: Duration = Duration::from_secs(10);

/// Folder of the tools directory that keeps the manifests read from GitHub.
const MANIFESTS_DIR: &str = ".manifests";

/// Manifests read in this run, by release tag.
static MANIFESTS: LazyLock<Mutex<HashMap<String, ReleaseManifest>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Hash and size of one binary of a release.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReleaseArtifact {
    /// Lowercase SHA-256 of the file.
    pub sha256: String,
    /// Size in bytes.
    #[serde(default)]
    pub size: u64,
}

/// `manifest.json` of an SDK release.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReleaseManifest {
    /// Release tag, such as `v2.4.0`.
    pub version: String,
    /// Binaries by file name.
    pub artifacts: BTreeMap<String, ReleaseArtifact>,
}

/// Whether the installed SDK is the published one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum SdkIntegrity {
    /// Version and hashes match the published release.
    Verified,
    /// They do not match, but the user chose to use these files.
    Trusted {
        /// Files that differ from the release.
        files: Vec<String>,
    },
    /// The installed version is not a published release, or its files differ from it.
    Mismatch {
        /// Files that differ from the release; empty when the version itself is unknown.
        files: Vec<String>,
        /// The installed version has no published release.
        unknown_version: bool,
    },
    /// The release manifest could not be read, now or before.
    Unknown,
}

impl SdkIntegrity {
    /// Whether launching with this SDK needs the user's confirmation.
    pub fn needs_confirmation(&self) -> bool {
        matches!(self, Self::Mismatch { .. })
    }
}

/// Release tag of an installed version.
fn tag(version: &str) -> String {
    format!("v{}", version.trim_start_matches('v'))
}

/// Lowercase SHA-256 of a file.
///
/// # Errors
///
/// Fails when the file cannot be read.
pub fn sha256_file(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

/// Hashes of the installed binaries joined in one value, used to remember trusted files.
pub fn fingerprint(installation: &Installation) -> Option<String> {
    let hashes: Option<Vec<String>> = REQUIRED_BINARIES
        .iter()
        .map(|name| sha256_file(&binary_path(installation, name)).ok())
        .collect();
    hashes.map(|hashes| hashes.join(":"))
}

fn binary_path(installation: &Installation, name: &str) -> PathBuf {
    installation.path.join("binaries").join(name)
}

fn cache_path(tools_dir: &Path, tag: &str) -> PathBuf {
    tools_dir.join(MANIFESTS_DIR).join(format!("{tag}.json"))
}

/// What reading the manifest of a release gave.
enum ManifestLookup {
    Found(ReleaseManifest),
    /// GitHub answered that the release does not exist.
    NoRelease,
    /// Neither GitHub nor the cache had it.
    Unavailable,
}

async fn manifest(http: &reqwest::Client, tools_dir: &Path, tag: &str) -> ManifestLookup {
    if let Some(cached) = MANIFESTS
        .lock()
        .ok()
        .and_then(|manifests| manifests.get(tag).cloned())
    {
        return ManifestLookup::Found(cached);
    }
    let url = format!("https://github.com/{SDK_REPOSITORY}/releases/download/{tag}/manifest.json");
    let fetched = async {
        let response = http.get(&url).timeout(MANIFEST_TIMEOUT).send().await?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        response
            .error_for_status()?
            .json::<ReleaseManifest>()
            .await
            .map(Some)
    }
    .await;
    match fetched {
        Ok(Some(manifest)) => {
            remember(tools_dir, tag, &manifest);
            ManifestLookup::Found(manifest)
        }
        Ok(None) => ManifestLookup::NoRelease,
        Err(error) => {
            tracing::debug!(%error, %tag, "SDK release manifest unavailable; using the cached one");
            fs::read(cache_path(tools_dir, tag))
                .ok()
                .and_then(|bytes| serde_json::from_slice(&bytes).ok())
                .map_or(ManifestLookup::Unavailable, ManifestLookup::Found)
        }
    }
}

fn remember(tools_dir: &Path, tag: &str, manifest: &ReleaseManifest) {
    if let Ok(mut manifests) = MANIFESTS.lock() {
        manifests.insert(tag.to_owned(), manifest.clone());
    }
    let path = cache_path(tools_dir, tag);
    let saved = path
        .parent()
        .map_or(Ok(()), fs::create_dir_all)
        .and_then(|()| {
            serde_json::to_vec_pretty(manifest)
                .map_err(io::Error::other)
                .and_then(|bytes| fs::write(&path, bytes))
        });
    if let Err(error) = saved {
        tracing::debug!(%error, "Could not keep the SDK release manifest");
    }
}

/// Binaries whose hash differs from the manifest, or that it does not list.
fn differing_files(installation: &Installation, manifest: &ReleaseManifest) -> Vec<String> {
    REQUIRED_BINARIES
        .iter()
        .filter(|name| {
            let expected = manifest
                .artifacts
                .get(**name)
                .map(|artifact| artifact.sha256.to_ascii_lowercase());
            let actual = sha256_file(&binary_path(installation, name)).ok();
            expected.is_none() || expected != actual
        })
        .map(|name| (*name).to_owned())
        .collect()
}

/// Compare an installation with its published release; `trusted` is the fingerprint of
/// files the user chose to use anyway.
pub async fn verify(
    http: &reqwest::Client,
    tools_dir: &Path,
    installation: &Installation,
    trusted: Option<&str>,
) -> SdkIntegrity {
    let tag = tag(&installation.version);
    let (files, unknown_version) = match manifest(http, tools_dir, &tag).await {
        ManifestLookup::Found(manifest)
            if manifest.version.trim_start_matches('v') == installation.version =>
        {
            (differing_files(installation, &manifest), false)
        }
        ManifestLookup::Found(_) | ManifestLookup::NoRelease => (Vec::new(), true),
        ManifestLookup::Unavailable => return SdkIntegrity::Unknown,
    };
    if files.is_empty() && !unknown_version {
        return SdkIntegrity::Verified;
    }
    if trusted.is_some_and(|trusted| fingerprint(installation).as_deref() == Some(trusted)) {
        return SdkIntegrity::Trusted { files };
    }
    tracing::warn!(version = %installation.version, ?files, unknown_version, "The installed SDK does not match its release");
    SdkIntegrity::Mismatch {
        files,
        unknown_version,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AppResult;

    fn install(root: &Path, dll: &[u8]) -> AppResult<Installation> {
        let path = root.join("WoWControlSDK-v2.4.0");
        fs::create_dir_all(path.join("binaries"))?;
        fs::write(path.join("binaries/WoWControlSDK.dll"), dll)?;
        fs::write(path.join("binaries/WowInjector.exe"), b"injector")?;
        Ok(Installation {
            path,
            version: "2.4.0".to_owned(),
        })
    }

    fn manifest_for(installation: &Installation) -> AppResult<ReleaseManifest> {
        let mut artifacts = BTreeMap::new();
        for name in REQUIRED_BINARIES {
            artifacts.insert(
                (*name).to_owned(),
                ReleaseArtifact {
                    sha256: sha256_file(&binary_path(installation, name))?,
                    size: 0,
                },
            );
        }
        Ok(ReleaseManifest {
            version: "v2.4.0".to_owned(),
            artifacts,
        })
    }

    #[test]
    fn hashes_files() -> AppResult<()> {
        let directory = tempfile::tempdir()?;
        let path = directory.path().join("file");
        fs::write(&path, b"abc")?;
        assert_eq!(
            sha256_file(&path)?,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        Ok(())
    }

    #[test]
    fn finds_the_files_that_differ() -> AppResult<()> {
        let directory = tempfile::tempdir()?;
        let installation = install(directory.path(), b"dll")?;
        let manifest = manifest_for(&installation)?;
        assert!(differing_files(&installation, &manifest).is_empty());
        fs::write(binary_path(&installation, "WoWControlSDK.dll"), b"patched")?;
        assert_eq!(
            differing_files(&installation, &manifest),
            vec!["WoWControlSDK.dll".to_owned()]
        );
        Ok(())
    }

    #[test]
    fn uses_the_cached_manifest_and_trusted_files() -> AppResult<()> {
        let directory = tempfile::tempdir()?;
        let installation = install(directory.path(), b"dll")?;
        let manifest = manifest_for(&installation)?;
        remember(directory.path(), "v2.4.0", &manifest);
        fs::write(binary_path(&installation, "WoWControlSDK.dll"), b"patched")?;
        let trusted = fingerprint(&installation);

        // The manifest was remembered above, so no request leaves the test.
        let http = reqwest::Client::new();
        let mismatch =
            tauri::async_runtime::block_on(verify(&http, directory.path(), &installation, None));
        assert!(mismatch.needs_confirmation());
        let accepted = tauri::async_runtime::block_on(verify(
            &http,
            directory.path(),
            &installation,
            trusted.as_deref(),
        ));
        assert_eq!(
            accepted,
            SdkIntegrity::Trusted {
                files: vec!["WoWControlSDK.dll".to_owned()]
            }
        );
        Ok(())
    }
}

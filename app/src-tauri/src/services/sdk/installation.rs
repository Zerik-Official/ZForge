//! Local SDK installations under the tools directory.

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use crate::error::AppResult;
use crate::services::sdk::SDK_PREFIX;
use crate::services::sdk::version::SdkVersion;

/// Folder inside an installation that holds the binaries.
const BINARIES_DIR: &str = "binaries";

/// Binaries an installation must contain to be usable.
pub const REQUIRED_BINARIES: &[&str] = &["WoWControlSDK.dll", "WowInjector.exe"];

/// A `WoWControlSDK-v<version>` folder found on disk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Installation {
    /// Installation folder.
    pub path: PathBuf,
    /// Version taken from the folder name.
    pub version: String,
}

impl Installation {
    /// Required binaries that are missing, as paths relative to the installation.
    pub fn missing_files(&self) -> Vec<String> {
        REQUIRED_BINARIES
            .iter()
            .filter(|name| !self.path.join(BINARIES_DIR).join(name).is_file())
            .map(|name| format!("{BINARIES_DIR}/{name}"))
            .collect()
    }

    /// Whether every required binary is present.
    pub fn is_valid(&self) -> bool {
        self.missing_files().is_empty()
    }

    /// Path of the SDK DLL injected into the game.
    pub fn dll_path(&self) -> PathBuf {
        self.path.join(BINARIES_DIR).join("WoWControlSDK.dll")
    }

    /// Path of the injector that launches the game.
    pub fn injector_path(&self) -> PathBuf {
        self.path.join(BINARIES_DIR).join("WowInjector.exe")
    }
}

/// Every SDK folder in the tools directory, newest version first.
///
/// # Errors
///
/// Fails when the tools directory exists but cannot be listed.
pub fn list(tools_dir: &Path) -> AppResult<Vec<Installation>> {
    let entries = match fs::read_dir(tools_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };
    let mut installations = Vec::new();
    for entry in entries {
        let path = entry?.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let Some(raw_version) = name.strip_prefix(SDK_PREFIX) else {
            continue;
        };
        if !path.is_dir() {
            continue;
        }
        installations.push(Installation {
            version: raw_version.trim_start_matches('v').to_owned(),
            path,
        });
    }
    installations.sort_by(|a, b| SdkVersion::parse(&b.version).cmp(&SdkVersion::parse(&a.version)));
    Ok(installations)
}

/// The newest valid installation, or the newest broken one when none is valid.
///
/// # Errors
///
/// Fails when the tools directory exists but cannot be listed.
pub fn find(tools_dir: &Path) -> AppResult<Option<Installation>> {
    let installations = list(tools_dir)?;
    let valid = installations
        .iter()
        .find(|installation| installation.is_valid())
        .cloned();
    Ok(valid.or_else(|| installations.into_iter().next()))
}

/// The newest valid installation, if any.
///
/// # Errors
///
/// Fails when the tools directory exists but cannot be listed.
pub fn find_valid(tools_dir: &Path) -> AppResult<Option<Installation>> {
    Ok(find(tools_dir)?.filter(Installation::is_valid))
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Create an installation folder, optionally with its binaries.
    pub(crate) fn create(tools_dir: &Path, version: &str, complete: bool) -> AppResult<PathBuf> {
        let path = tools_dir.join(format!("{SDK_PREFIX}v{version}"));
        let binaries = path.join(BINARIES_DIR);
        fs::create_dir_all(&binaries)?;
        if complete {
            for name in REQUIRED_BINARIES {
                fs::write(binaries.join(name), b"bin")?;
            }
        }
        Ok(path)
    }

    #[test]
    fn prefers_the_newest_valid_installation() -> AppResult<()> {
        let directory = tempfile::tempdir()?;
        assert_eq!(find(&directory.path().join("missing"))?, None);

        create(directory.path(), "1.2.0", true)?;
        create(directory.path(), "1.10.0", false)?;
        fs::create_dir_all(directory.path().join("unrelated"))?;

        let found = find(directory.path())?;
        assert_eq!(found.as_ref().map(|i| i.version.as_str()), Some("1.2.0"));

        let broken = &list(directory.path())?[0];
        assert_eq!(broken.version, "1.10.0");
        assert_eq!(
            broken.missing_files(),
            ["binaries/WoWControlSDK.dll", "binaries/WowInjector.exe"]
        );
        Ok(())
    }
}

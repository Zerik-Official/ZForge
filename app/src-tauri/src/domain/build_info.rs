//! Version and commit the running launcher was built from.

use serde::Serialize;

/// Length of the abbreviated commit hash shown in the interface.
const SHORT_HASH_LENGTH: usize = 7;

/// Version and commit of the running launcher.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct BuildInfo {
    /// Launcher version from `tauri.conf.json`.
    pub version: String,
    /// Full commit hash, when the build knew it.
    pub commit: Option<String>,
    /// First characters of the commit hash.
    pub commit_short: Option<String>,
    /// Commit date in ISO 8601 with its time zone.
    pub commit_date: Option<String>,
    /// Whether the build included uncommitted changes.
    pub dirty: bool,
    /// Page of the commit in the public repository.
    pub commit_url: Option<String>,
}

impl BuildInfo {
    /// Describe a build from its version and the commit data captured at compile time.
    pub fn new(
        version: String,
        commit: Option<&str>,
        commit_date: Option<&str>,
        dirty: bool,
        repository_url: &str,
    ) -> Self {
        let commit = commit.map(str::trim).filter(|hash| !hash.is_empty());
        Self {
            version,
            commit: commit.map(str::to_owned),
            commit_short: commit.map(|hash| hash.chars().take(SHORT_HASH_LENGTH).collect()),
            commit_date: commit_date.map(str::to_owned),
            dirty,
            commit_url: commit.map(|hash| format!("{repository_url}/commit/{hash}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn links_the_commit_and_shortens_its_hash() {
        let info = BuildInfo::new(
            "0.0.1".into(),
            Some("44f76ed1a2b3c4d5e6f7"),
            Some("2026-11-27T10:00:00-05:00"),
            false,
            "https://github.com/Zerik-Official/ZForge",
        );
        assert_eq!(info.commit_short.as_deref(), Some("44f76ed"));
        assert_eq!(
            info.commit_url.as_deref(),
            Some("https://github.com/Zerik-Official/ZForge/commit/44f76ed1a2b3c4d5e6f7")
        );
    }

    #[test]
    fn has_no_commit_without_git() {
        let info = BuildInfo::new("0.0.1".into(), None, None, false, "https://example.com");
        assert_eq!(info.commit, None);
        assert_eq!(info.commit_url, None);
    }
}

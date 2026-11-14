//! SDK releases published on GitHub.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::services::sdk::{SDK_PREFIX, SDK_REPOSITORY};

const USER_AGENT: &str = "ZForge";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(12);
const CACHE_TTL: Duration = Duration::from_secs(10 * 60);

/// The latest downloadable SDK release.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SdkRelease {
    /// Git tag, for example `v1.2.0`.
    pub tag_name: String,
    /// Version without the `v` prefix.
    pub version: String,
    /// Download URL of the release zip.
    pub browser_download_url: String,
    /// Zip size in bytes, when published.
    pub size: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    #[serde(default)]
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
    #[serde(default)]
    size: Option<u64>,
}

impl GithubRelease {
    fn into_sdk_release(self) -> Option<SdkRelease> {
        let tag_name = self.tag_name.trim().to_owned();
        let asset = self
            .assets
            .into_iter()
            .find(|asset| asset.name.starts_with(SDK_PREFIX) && asset.name.ends_with(".zip"))?;
        if tag_name.is_empty() || asset.browser_download_url.is_empty() {
            return None;
        }
        Some(SdkRelease {
            version: tag_name.trim_start_matches('v').to_owned(),
            tag_name,
            browser_download_url: asset.browser_download_url,
            size: asset.size,
        })
    }
}

/// HTTP client for GitHub with a short-lived cache of the latest release.
#[derive(Debug)]
pub struct ReleaseClient {
    http: reqwest::Client,
    cache: Mutex<Option<(Instant, SdkRelease)>>,
}

impl ReleaseClient {
    /// Build the client.
    ///
    /// # Errors
    ///
    /// Fails when the HTTP client cannot be created.
    pub fn new() -> AppResult<Self> {
        Ok(Self {
            http: reqwest::Client::builder()
                .user_agent(USER_AGENT)
                .timeout(REQUEST_TIMEOUT)
                .build()?,
            cache: Mutex::new(None),
        })
    }

    /// Shared HTTP client, also used for downloads.
    pub fn http(&self) -> &reqwest::Client {
        &self.http
    }

    fn cached(&self) -> AppResult<Option<SdkRelease>> {
        let cache = self
            .cache
            .lock()
            .map_err(|_| AppError::LockPoisoned("sdk release cache"))?;
        Ok(cache
            .as_ref()
            .filter(|(fetched_at, _)| fetched_at.elapsed() < CACHE_TTL)
            .map(|(_, release)| release.clone()))
    }

    /// The latest release, served from cache for a few minutes.
    ///
    /// # Errors
    ///
    /// Fails when GitHub is unreachable or the release has no SDK zip.
    pub async fn latest(&self) -> AppResult<SdkRelease> {
        if let Some(release) = self.cached()? {
            return Ok(release);
        }
        let url = format!("https://api.github.com/repos/{SDK_REPOSITORY}/releases/latest");
        let release = self
            .http
            .get(url)
            .header(reqwest::header::ACCEPT, "application/vnd.github+json")
            .send()
            .await?
            .error_for_status()?
            .json::<GithubRelease>()
            .await?
            .into_sdk_release()
            .ok_or(AppError::SdkReleaseUnavailable)?;
        *self
            .cache
            .lock()
            .map_err(|_| AppError::LockPoisoned("sdk release cache"))? =
            Some((Instant::now(), release.clone()));
        Ok(release)
    }

    /// The SDK license text from the repository.
    ///
    /// # Errors
    ///
    /// Fails when GitHub is unreachable or the file is empty.
    pub async fn license(&self) -> AppResult<String> {
        let url = format!("https://raw.githubusercontent.com/{SDK_REPOSITORY}/main/LICENSE");
        let text = self
            .http
            .get(url)
            .send()
            .await?
            .error_for_status()?
            .text()
            .await?;
        if text.trim().is_empty() {
            return Err(AppError::SdkReleaseUnavailable);
        }
        Ok(text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_the_sdk_zip_asset() -> Result<(), serde_json::Error> {
        let release: GithubRelease = serde_json::from_str(
            r#"{"tag_name":"v1.2.0","assets":[
                {"name":"source.tar.gz","browser_download_url":"https://x/source"},
                {"name":"WoWControlSDK-v1.2.0.zip","browser_download_url":"https://x/sdk.zip","size":42}
            ]}"#,
        )?;
        assert_eq!(
            release.into_sdk_release(),
            Some(SdkRelease {
                tag_name: "v1.2.0".to_owned(),
                version: "1.2.0".to_owned(),
                browser_download_url: "https://x/sdk.zip".to_owned(),
                size: Some(42),
            })
        );

        let without_zip: GithubRelease =
            serde_json::from_str(r#"{"tag_name":"v1.2.0","assets":[]}"#)?;
        assert_eq!(without_zip.into_sdk_release(), None);
        Ok(())
    }
}

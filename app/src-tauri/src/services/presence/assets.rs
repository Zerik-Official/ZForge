//! Addresses of the images uploaded to the Discord application, for the settings preview.

use std::collections::BTreeMap;
use std::sync::Mutex;

use serde::Deserialize;

use crate::error::{AppError, AppResult};

/// An image of the Discord application as the public assets endpoint lists it.
#[derive(Debug, Deserialize)]
struct DiscordAsset {
    id: String,
    name: String,
}

/// Image addresses by asset key, read once per launcher run.
#[derive(Debug, Default)]
pub struct PresenceAssets {
    cache: Mutex<Option<BTreeMap<String, String>>>,
}

impl PresenceAssets {
    /// Image addresses by asset key; empty without a Discord client id.
    ///
    /// # Errors
    ///
    /// Returns an error when Discord cannot be reached or answers with an error.
    pub async fn urls(
        &self,
        http: &reqwest::Client,
        client_id: &str,
    ) -> AppResult<BTreeMap<String, String>> {
        if let Some(cached) = self
            .cache
            .lock()
            .map_err(|_| AppError::LockPoisoned("presence assets"))?
            .clone()
        {
            return Ok(cached);
        }
        let client_id = client_id.trim();
        if client_id.is_empty() {
            return Ok(BTreeMap::new());
        }
        let assets: Vec<DiscordAsset> = http
            .get(format!(
                "https://discord.com/api/v10/oauth2/applications/{client_id}/assets"
            ))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        let urls: BTreeMap<String, String> = assets
            .into_iter()
            .map(|asset| {
                let url = format!(
                    "https://cdn.discordapp.com/app-assets/{client_id}/{}.png",
                    asset.id
                );
                (asset.name, url)
            })
            .collect();
        *self
            .cache
            .lock()
            .map_err(|_| AppError::LockPoisoned("presence assets"))? = Some(urls.clone());
        Ok(urls)
    }
}

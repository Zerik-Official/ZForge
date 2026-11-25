//! Launcher features that depend on the SDK and whether the installed one supports them.
//!
//! This is the single place that maps each feature to the SDK version it
//! needs; commands and the frontend ask here instead of comparing versions.

use serde::Serialize;

use crate::services::sdk::manager::SdkStatus;
use crate::services::sdk::version::SdkVersion;

/// A launcher feature that needs the SDK.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Feature {
    /// Live game data: session phases, character, zone and Rich Presence details.
    LiveSession,
    /// Windows notifications with native answer buttons.
    Notifications,
    /// Replying to whispers from the notification.
    WhisperReply,
    /// Logging in, selecting the realm and entering the world automatically.
    Accounts,
    /// Starting the game in the background until the character is in the world.
    HiddenStart,
    /// Realm list and character creation in the session and Rich Presence.
    GlueScreens,
    /// Portraits of the other player in notifications.
    PlayerPortraits,
}

impl Feature {
    /// Every feature, in the order the launcher shows them.
    pub const ALL: [Self; 7] = [
        Self::LiveSession,
        Self::Notifications,
        Self::WhisperReply,
        Self::Accounts,
        Self::HiddenStart,
        Self::GlueScreens,
        Self::PlayerPortraits,
    ];

    /// First SDK version that supports the feature.
    pub fn required_version(self) -> &'static str {
        match self {
            Self::LiveSession => "1.0.0",
            Self::Notifications => "2.1.0",
            Self::WhisperReply => "2.2.0",
            Self::Accounts | Self::HiddenStart => "2.2.1",
            Self::GlueScreens | Self::PlayerPortraits => "2.4.0",
        }
    }

    /// Whether an installed SDK version supports the feature.
    pub fn supported_by(self, version: &str) -> bool {
        meets(version, self.required_version())
    }
}

fn meets(version: &str, required: &str) -> bool {
    match (SdkVersion::parse(version), SdkVersion::parse(required)) {
        (Some(installed), Some(required)) => installed >= required,
        _ => false,
    }
}

/// Why a feature cannot be used.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Unavailable {
    /// No SDK is installed.
    SdkMissing,
    /// The SDK folder is incomplete.
    SdkCorrupted,
    /// The installed SDK is older than the feature needs.
    SdkOutdated,
}

/// Whether one feature can be used.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FeatureStatus {
    /// The feature.
    pub feature: Feature,
    /// First SDK version that supports it.
    pub required_version: &'static str,
    /// The installed SDK supports it.
    pub available: bool,
    /// Why it cannot be used, when it is not available.
    pub reason: Option<Unavailable>,
    /// Installing the latest published SDK would make it available.
    pub fixable: bool,
}

/// The installed SDK and what it allows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Capabilities {
    /// Installed version, when an SDK folder exists.
    pub sdk_version: Option<String>,
    /// Latest published version, when GitHub was reachable.
    pub latest_version: Option<String>,
    /// A newer version than the installed one is available.
    pub update_available: bool,
    /// An installation is running.
    pub installing: bool,
    /// Every feature with its availability.
    pub features: Vec<FeatureStatus>,
}

impl Capabilities {
    /// Capabilities of an SDK status.
    pub fn from_status(status: &SdkStatus) -> Self {
        let features = Feature::ALL
            .into_iter()
            .map(|feature| {
                let reason = match status.version.as_deref() {
                    _ if !status.installed => Some(Unavailable::SdkMissing),
                    _ if !status.valid => Some(Unavailable::SdkCorrupted),
                    Some(version) if feature.supported_by(version) => None,
                    _ => Some(Unavailable::SdkOutdated),
                };
                let fixable = reason.is_some()
                    && status
                        .latest_version
                        .as_deref()
                        .is_some_and(|latest| feature.supported_by(latest));
                FeatureStatus {
                    feature,
                    required_version: feature.required_version(),
                    available: reason.is_none(),
                    reason,
                    fixable,
                }
            })
            .collect();
        Self {
            sdk_version: status.version.clone(),
            latest_version: status.latest_version.clone(),
            update_available: status.update_available,
            installing: status.installing,
            features,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn status(version: Option<&str>, valid: bool, latest: Option<&str>) -> SdkStatus {
        SdkStatus {
            installed: version.is_some(),
            valid,
            version: version.map(str::to_owned),
            path: None,
            missing_files: Vec::new(),
            needs_install: !valid,
            needs_repair: version.is_some() && !valid,
            application_id_configured: true,
            discord_enabled: false,
            discord_auto_update: true,
            sdk_last_error: None,
            sdk_ever_installed: version.is_some(),
            latest_version: latest.map(str::to_owned),
            latest_url: None,
            update_available: false,
            installing: false,
        }
    }

    fn feature(capabilities: &Capabilities, feature: Feature) -> Option<&FeatureStatus> {
        capabilities
            .features
            .iter()
            .find(|status| status.feature == feature)
    }

    #[test]
    fn maps_features_to_versions() {
        assert!(Feature::Notifications.supported_by("v2.1.0"));
        assert!(!Feature::WhisperReply.supported_by("2.1.9"));
        assert!(Feature::Accounts.supported_by("2.2.1"));
        assert!(!Feature::HiddenStart.supported_by("v2.2.0"));
        assert!(!Feature::LiveSession.supported_by("garbage"));
    }

    #[test]
    fn explains_why_features_are_unavailable() {
        let missing = Capabilities::from_status(&status(None, false, Some("2.2.1")));
        let accounts = feature(&missing, Feature::Accounts);
        assert_eq!(
            accounts.map(|status| (status.reason, status.fixable)),
            Some((Some(Unavailable::SdkMissing), true))
        );

        let broken = Capabilities::from_status(&status(Some("2.2.0"), false, None));
        assert_eq!(
            feature(&broken, Feature::LiveSession).and_then(|status| status.reason),
            Some(Unavailable::SdkCorrupted)
        );

        let old = Capabilities::from_status(&status(Some("v2.2.0"), true, Some("v2.2.0")));
        let reply = feature(&old, Feature::WhisperReply);
        assert_eq!(reply.map(|status| status.available), Some(true));
        let hidden = feature(&old, Feature::HiddenStart);
        assert_eq!(
            hidden.map(|status| (status.reason, status.fixable)),
            Some((Some(Unavailable::SdkOutdated), false))
        );
    }
}

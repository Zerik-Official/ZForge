//! Session tokens that authenticate the launcher to the SDK pipes (SDK 2.0+).

use std::fmt;

use crate::error::{AppError, AppResult};
use crate::services::sdk::version::SdkVersion;

const TOKEN_BYTES: usize = 32;
const FIRST_VERSION_WITH_AUTH: &str = "2.0.0";

/// A random per-session secret, never logged.
#[derive(Clone, PartialEq, Eq)]
pub struct SessionToken(String);

impl SessionToken {
    /// Generate a token of 32 random bytes, hex-encoded.
    ///
    /// # Errors
    ///
    /// Fails when the operating system random generator is unavailable.
    pub fn generate() -> AppResult<Self> {
        let mut bytes = [0_u8; TOKEN_BYTES];
        getrandom::fill(&mut bytes).map_err(|error| AppError::BackgroundTask(error.to_string()))?;
        Ok(Self(
            bytes.iter().map(|byte| format!("{byte:02x}")).collect(),
        ))
    }

    /// Hex representation sent to the SDK.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for SessionToken {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("SessionToken(<redacted>)")
    }
}

/// Whether an installed SDK version requires authentication.
pub fn version_requires_auth(version: &str) -> bool {
    match (
        SdkVersion::parse(version),
        SdkVersion::parse(FIRST_VERSION_WITH_AUTH),
    ) {
        (Some(installed), Some(first)) => installed >= first,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_distinct_hex_tokens() -> AppResult<()> {
        let first = SessionToken::generate()?;
        let second = SessionToken::generate()?;
        assert_eq!(first.as_str().len(), TOKEN_BYTES * 2);
        assert!(first.as_str().chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(first, second);
        assert_eq!(format!("{first:?}"), "SessionToken(<redacted>)");
        Ok(())
    }

    #[test]
    fn detects_auth_capable_versions() {
        assert!(version_requires_auth("2.0.0"));
        assert!(version_requires_auth("v2.1"));
        assert!(!version_requires_auth("1.1.0"));
        assert!(!version_requires_auth("garbage"));
    }
}

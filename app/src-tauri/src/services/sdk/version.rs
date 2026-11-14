//! SDK version parsing and comparison.

use std::cmp::Ordering;
use std::fmt;

/// A dotted numeric version such as `1.2.0`; non-numeric prefixes like `v` are ignored.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SdkVersion {
    parts: Vec<u64>,
}

impl SdkVersion {
    /// Parse the first dotted number found in the text (`v1.2.3` → `1.2.3`).
    pub fn parse(text: &str) -> Option<Self> {
        let start = text.find(|character: char| character.is_ascii_digit())?;
        let numeric: String = text[start..]
            .chars()
            .take_while(|character| character.is_ascii_digit() || *character == '.')
            .collect();
        let parts = numeric
            .split('.')
            .filter(|part| !part.is_empty())
            .map(str::parse)
            .collect::<Result<Vec<u64>, _>>()
            .ok()?;
        Some(Self { parts })
    }
}

impl Ord for SdkVersion {
    fn cmp(&self, other: &Self) -> Ordering {
        let length = self.parts.len().max(other.parts.len());
        let part = |version: &Self, index: usize| version.parts.get(index).copied().unwrap_or(0);
        (0..length)
            .map(|index| part(self, index).cmp(&part(other, index)))
            .find(|ordering| ordering.is_ne())
            .unwrap_or(Ordering::Equal)
    }
}

impl PartialOrd for SdkVersion {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl fmt::Display for SdkVersion {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let parts: Vec<String> = self.parts.iter().map(u64::to_string).collect();
        formatter.write_str(&parts.join("."))
    }
}

/// Whether `candidate` is strictly newer than `baseline`; unparsable versions are never newer.
pub fn is_newer(candidate: &str, baseline: &str) -> bool {
    match (SdkVersion::parse(candidate), SdkVersion::parse(baseline)) {
        (Some(candidate), Some(baseline)) => candidate > baseline,
        (Some(_), None) => true,
        (None, _) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_compares() {
        assert_eq!(
            SdkVersion::parse("WoWControlSDK-v1.10.2").map(|v| v.to_string()),
            Some("1.10.2".to_owned())
        );
        assert!(is_newer("v1.10.0", "1.9.9"));
        assert!(!is_newer("1.0", "1.0.0"));
        assert!(!is_newer("garbage", "1.0.0"));
        assert!(is_newer("1.0.0", "garbage"));
    }
}

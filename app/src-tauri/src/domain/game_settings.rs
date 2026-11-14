//! Per-game launcher settings.
//!
//! Settings are keyed by the identifiers declared in the game's settings schema,
//! so the backend stores them as a typed key/value map instead of a fixed struct.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::domain::UnixMillis;

/// A single setting value as declared by the settings schema.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SettingValue {
    /// Checkbox-like settings.
    Bool(bool),
    /// Whole-number settings (sliders with integer steps, enum indices).
    Int(i64),
    /// Fractional settings (volumes, densities).
    Float(f64),
    /// Free text or string-keyed options (resolution, realm list).
    Text(String),
}

/// All settings of one game, keyed by setting identifier.
pub type SettingsValues = BTreeMap<String, SettingValue>;

/// Settings persisted for one game together with their last modification time.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StoredGameSettings {
    /// Identifier of the owning game.
    pub game_id: String,
    /// Setting values keyed by setting identifier.
    pub values: SettingsValues,
    /// Last time the launcher saved these settings.
    pub updated_at: UnixMillis,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn untagged_values_round_trip() -> Result<(), serde_json::Error> {
        let json = r#"{"vsync":true,"farclip":1277,"volume":0.5,"resolution":"1920x1080"}"#;
        let values: SettingsValues = serde_json::from_str(json)?;
        assert_eq!(values.get("vsync"), Some(&SettingValue::Bool(true)));
        assert_eq!(values.get("farclip"), Some(&SettingValue::Int(1277)));
        assert_eq!(values.get("volume"), Some(&SettingValue::Float(0.5)));
        assert_eq!(
            values.get("resolution"),
            Some(&SettingValue::Text("1920x1080".to_owned()))
        );
        let reparsed: SettingsValues = serde_json::from_str(&serde_json::to_string(&values)?)?;
        assert_eq!(reparsed, values);
        Ok(())
    }
}

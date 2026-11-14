//! Settings schema: the data-driven description of every per-game setting.
//!
//! The schema drives both the settings UI (controls, options, conditions) and
//! how each setting maps to a `Config.wtf` CVar.

use serde::{Deserialize, Serialize};

use crate::domain::game_settings::SettingValue;

/// Every setting of one game version, grouped in categories.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSchema {
    /// Schema identifier, for example `wow-wotlk-335a`.
    pub id: String,
    /// Game identifier.
    pub game: String,
    /// Expansion key.
    pub expansion: String,
    /// Client version.
    pub version: String,
    /// Categories in display order.
    pub categories: Vec<SettingsCategory>,
}

/// A group of settings shown together.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsCategory {
    /// Category identifier.
    pub id: String,
    /// Translation key of the title.
    pub label: String,
    /// Icon class.
    pub icon: String,
    /// Settings in display order.
    pub settings: Vec<SettingDefinition>,
}

/// UI control used to edit a setting.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ControlKind {
    /// Numeric slider (range or discrete options).
    Slider,
    /// Drop-down list.
    Select,
    /// Toggle.
    Checkbox,
    /// Free text input.
    Text,
    /// Text input with suggestions.
    Combobox,
}

/// An option of a select or discrete slider.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SettingOption {
    /// Option with a translated label.
    Labeled {
        /// Stored value.
        value: SettingValue,
        /// Translation key of the label.
        label: String,
    },
    /// Option whose value is also its label.
    Plain(SettingValue),
}

/// Show or enable a setting only when another setting has a given value.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingCondition {
    /// Key of the setting to compare.
    pub field: String,
    /// Required value.
    pub equals: SettingValue,
}

/// Defaults that depend on the user's machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DynamicDefault {
    /// Native resolution of the primary monitor, as `WIDTHxHEIGHT`.
    DisplayResolution,
}

/// How a CVar value is encoded in `Config.wtf`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WtfCodec {
    /// `"1"` / `"0"`.
    Bool,
    /// Whole number.
    Int,
    /// Decimal number.
    Float,
    /// Raw text; an empty value removes the CVar.
    String,
}

/// Mapping between a setting and a `Config.wtf` CVar.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WtfBinding {
    /// CVar name.
    pub key: String,
    /// Value encoding.
    #[serde(rename = "type")]
    pub codec: WtfCodec,
    /// Value the game assumes when the CVar is missing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub absent_means: Option<SettingValue>,
    /// Remove the CVar instead of writing it when the value equals `absent_means`.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub omit_when_absent: bool,
    /// Also write the value to every `Data/<locale>/realmlist.wtf`.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub mirror_to_realmlist_wtf: bool,
}

/// One configurable setting.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingDefinition {
    /// Setting identifier, unique within the schema.
    pub key: String,
    /// UI control.
    #[serde(rename = "type")]
    pub control: ControlKind,
    /// Translation key of the label.
    pub label: String,
    /// Translation key of the help text.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Default value.
    pub default: SettingValue,
    /// Machine-dependent default that overrides `default` when available.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_from: Option<DynamicDefault>,
    /// Input placeholder.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    /// Allowed values for selects and discrete sliders.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<SettingOption>>,
    /// Slider minimum.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    /// Slider maximum.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    /// Slider step.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub step: Option<f64>,
    /// Name of a runtime option source (realm lists, audio devices…).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    /// Show the control only when the condition holds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible_when: Option<SettingCondition>,
    /// Enable the control only when the condition holds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled_when: Option<SettingCondition>,
    /// `Config.wtf` mapping; `None` for launcher-only settings.
    #[serde(default)]
    pub wtf: Option<WtfBinding>,
}

/// The value type a setting is stored as.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValueKind {
    /// Boolean.
    Bool,
    /// Whole number.
    Int,
    /// Decimal number.
    Float,
    /// Text.
    Text,
}

impl From<WtfCodec> for ValueKind {
    fn from(codec: WtfCodec) -> Self {
        match codec {
            WtfCodec::Bool => Self::Bool,
            WtfCodec::Int => Self::Int,
            WtfCodec::Float => Self::Float,
            WtfCodec::String => Self::Text,
        }
    }
}

impl SettingDefinition {
    /// Stored value type: the CVar codec, or the type of the default value.
    pub fn value_kind(&self) -> ValueKind {
        if let Some(binding) = &self.wtf {
            return binding.codec.into();
        }
        match self.default {
            SettingValue::Bool(_) => ValueKind::Bool,
            SettingValue::Int(_) => ValueKind::Int,
            SettingValue::Float(_) => ValueKind::Float,
            SettingValue::Text(_) => ValueKind::Text,
        }
    }
}

impl SettingsSchema {
    /// Every setting across all categories, in display order.
    pub fn settings(&self) -> impl Iterator<Item = &SettingDefinition> {
        self.categories
            .iter()
            .flat_map(|category| category.settings.iter())
    }
}

fn float_to_int(number: f64) -> Option<i64> {
    number.is_finite().then(|| number.round() as i64)
}

fn parse_bool(text: &str) -> Option<bool> {
    match text.trim().to_ascii_lowercase().as_str() {
        "1" | "true" => Some(true),
        "0" | "false" => Some(false),
        other => other.parse::<f64>().ok().map(|number| number != 0.0),
    }
}

impl SettingValue {
    /// Convert the value to the given type, or `None` when it cannot be represented.
    pub fn coerce(&self, kind: ValueKind) -> Option<Self> {
        match (kind, self) {
            (ValueKind::Bool, Self::Bool(value)) => Some(Self::Bool(*value)),
            (ValueKind::Bool, Self::Int(value)) => Some(Self::Bool(*value != 0)),
            (ValueKind::Bool, Self::Float(value)) => Some(Self::Bool(*value != 0.0)),
            (ValueKind::Bool, Self::Text(text)) => parse_bool(text).map(Self::Bool),
            (ValueKind::Int, Self::Bool(value)) => Some(Self::Int(i64::from(*value))),
            (ValueKind::Int, Self::Int(value)) => Some(Self::Int(*value)),
            (ValueKind::Int, Self::Float(value)) => float_to_int(*value).map(Self::Int),
            (ValueKind::Int, Self::Text(text)) => {
                let text = text.trim();
                text.parse::<i64>()
                    .ok()
                    .or_else(|| text.parse::<f64>().ok().and_then(float_to_int))
                    .map(Self::Int)
            }
            (ValueKind::Float, Self::Bool(value)) => {
                Some(Self::Float(if *value { 1.0 } else { 0.0 }))
            }
            (ValueKind::Float, Self::Int(value)) => Some(Self::Float(*value as f64)),
            (ValueKind::Float, Self::Float(value)) => {
                value.is_finite().then_some(Self::Float(*value))
            }
            (ValueKind::Float, Self::Text(text)) => text
                .trim()
                .parse::<f64>()
                .ok()
                .filter(|value| value.is_finite())
                .map(Self::Float),
            (ValueKind::Text, Self::Text(text)) => Some(Self::Text(text.clone())),
            (ValueKind::Text, other) => Some(Self::Text(other.to_cvar())),
        }
    }

    /// Encode the value as a `Config.wtf` CVar string.
    pub fn to_cvar(&self) -> String {
        match self {
            Self::Bool(value) => if *value { "1" } else { "0" }.to_owned(),
            Self::Int(value) => value.to_string(),
            Self::Float(value) => value.to_string(),
            Self::Text(text) => text.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coerces_between_kinds() {
        let text = |value: &str| SettingValue::Text(value.to_owned());
        assert_eq!(text("4").coerce(ValueKind::Int), Some(SettingValue::Int(4)));
        assert_eq!(
            text("1.5").coerce(ValueKind::Int),
            Some(SettingValue::Int(2))
        );
        assert_eq!(
            text("0").coerce(ValueKind::Bool),
            Some(SettingValue::Bool(false))
        );
        assert_eq!(text("x").coerce(ValueKind::Float), None);
        assert_eq!(
            SettingValue::Int(1).coerce(ValueKind::Float),
            Some(SettingValue::Float(1.0))
        );
        assert_eq!(
            SettingValue::Int(60).coerce(ValueKind::Text),
            Some(text("60"))
        );
    }

    #[test]
    fn encodes_cvars() {
        assert_eq!(SettingValue::Bool(true).to_cvar(), "1");
        assert_eq!(SettingValue::Float(0.5).to_cvar(), "0.5");
        assert_eq!(SettingValue::Int(1277).to_cvar(), "1277");
    }
}

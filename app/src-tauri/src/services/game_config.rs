//! Schema-driven mapping between launcher settings and the game's `.wtf` files.

use std::fs;
use std::path::{Path, PathBuf};

use crate::domain::game_settings::{SettingValue, SettingsValues};
use crate::domain::settings_schema::{DynamicDefault, SettingDefinition, SettingsSchema};
use crate::error::AppResult;
use crate::services::wtf::{self, ConfigWtf};

/// Machine-dependent values used for `defaultFrom` settings.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DynamicDefaults {
    /// Native primary monitor resolution as `WIDTHxHEIGHT`.
    pub display_resolution: Option<String>,
}

impl DynamicDefaults {
    fn resolve(&self, source: DynamicDefault) -> Option<SettingValue> {
        match source {
            DynamicDefault::DisplayResolution => {
                self.display_resolution.clone().map(SettingValue::Text)
            }
        }
    }
}

/// Default value of a setting, preferring its machine-dependent default.
fn default_value(setting: &SettingDefinition, dynamic: &DynamicDefaults) -> SettingValue {
    setting
        .default_from
        .and_then(|source| dynamic.resolve(source))
        .unwrap_or_else(|| setting.default.clone())
}

/// Coerce a value to the setting's type, falling back to its default.
fn normalized_value(
    setting: &SettingDefinition,
    value: Option<&SettingValue>,
    dynamic: &DynamicDefaults,
) -> SettingValue {
    let kind = setting.value_kind();
    value
        .and_then(|value| value.coerce(kind))
        .or_else(|| default_value(setting, dynamic).coerce(kind))
        .unwrap_or_else(|| setting.default.clone())
}

/// Every setting of the schema at its default value.
pub fn defaults(schema: &SettingsSchema, dynamic: &DynamicDefaults) -> SettingsValues {
    normalize(schema, &SettingsValues::new(), dynamic)
}

/// Complete a set of values: coerce each to its declared type, fill missing
/// settings with defaults and drop keys the schema does not know.
pub fn normalize(
    schema: &SettingsSchema,
    values: &SettingsValues,
    dynamic: &DynamicDefaults,
) -> SettingsValues {
    schema
        .settings()
        .map(|setting| {
            (
                setting.key.clone(),
                normalized_value(setting, values.get(&setting.key), dynamic),
            )
        })
        .collect()
}

/// Only the settings that are stored in game files.
pub fn file_backed(schema: &SettingsSchema, values: &SettingsValues) -> SettingsValues {
    schema
        .settings()
        .filter(|setting| setting.wtf.is_some())
        .filter_map(|setting| {
            values
                .get(&setting.key)
                .map(|value| (setting.key.clone(), value.clone()))
        })
        .collect()
}

/// Read every file-backed setting from a parsed `Config.wtf`.
pub fn scan(
    schema: &SettingsSchema,
    config: &ConfigWtf,
    dynamic: &DynamicDefaults,
) -> SettingsValues {
    schema
        .settings()
        .filter_map(|setting| {
            let binding = setting.wtf.as_ref()?;
            let raw = config.get(&binding.key).map(SettingValue::Text);
            let value = raw
                .as_ref()
                .and_then(|raw| raw.coerce(setting.value_kind()))
                .or_else(|| binding.absent_means.clone());
            Some((
                setting.key.clone(),
                normalized_value(setting, value.as_ref(), dynamic),
            ))
        })
        .collect()
}

/// Write every file-backed setting into a parsed `Config.wtf`.
///
/// Returns the realm list that must also be mirrored into `realmlist.wtf`, if any.
pub fn apply(
    schema: &SettingsSchema,
    values: &SettingsValues,
    config: &mut ConfigWtf,
    dynamic: &DynamicDefaults,
) -> Option<String> {
    let mut realmlist = None;
    for setting in schema.settings() {
        let Some(binding) = &setting.wtf else {
            continue;
        };
        let value = normalized_value(setting, values.get(&setting.key), dynamic);
        let encoded = value.to_cvar();
        let omitted = encoded.is_empty()
            || (binding.omit_when_absent && binding.absent_means.as_ref() == Some(&value));
        config.set(&binding.key, (!omitted).then_some(encoded.as_str()));
        if binding.mirror_to_realmlist_wtf && !encoded.is_empty() {
            realmlist = Some(encoded);
        }
    }
    realmlist
}

/// Files of a game installation that hold its configuration.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GameFiles {
    root: PathBuf,
}

impl GameFiles {
    /// Locate the files from the game executable path.
    pub fn from_exe(exe_path: &str) -> Self {
        let exe = Path::new(exe_path);
        Self {
            root: exe.parent().unwrap_or(exe).to_path_buf(),
        }
    }

    /// `WTF/Config.wtf`.
    pub fn config_wtf(&self) -> PathBuf {
        self.root.join("WTF").join("Config.wtf")
    }

    /// Every `Data/<locale>/realmlist.wtf`, for the locale folders that exist.
    ///
    /// # Errors
    ///
    /// Fails when the `Data` folder exists but cannot be listed.
    pub fn realmlist_files(&self) -> AppResult<Vec<PathBuf>> {
        let data = self.root.join("Data");
        if !data.is_dir() {
            return Ok(Vec::new());
        }
        let mut files = Vec::new();
        for entry in fs::read_dir(data)? {
            let path = entry?.path();
            if path.is_dir() {
                files.push(path.join("realmlist.wtf"));
            }
        }
        files.sort();
        Ok(files)
    }

    /// Read the file-backed settings currently stored in the game files.
    ///
    /// # Errors
    ///
    /// Fails when `Config.wtf` exists but cannot be read.
    pub fn scan(
        &self,
        schema: &SettingsSchema,
        dynamic: &DynamicDefaults,
    ) -> AppResult<SettingsValues> {
        Ok(scan(schema, &ConfigWtf::read(&self.config_wtf())?, dynamic))
    }

    /// Write settings into `Config.wtf` and, when needed, every `realmlist.wtf`.
    ///
    /// # Errors
    ///
    /// Fails when a file cannot be read or written.
    pub fn apply(
        &self,
        schema: &SettingsSchema,
        values: &SettingsValues,
        dynamic: &DynamicDefaults,
    ) -> AppResult<()> {
        let path = self.config_wtf();
        let mut config = ConfigWtf::read(&path)?;
        let realmlist = apply(schema, values, &mut config, dynamic);
        config.write(&path)?;
        if let Some(realmlist) = realmlist {
            for file in self.realmlist_files()? {
                wtf::set_realmlist(&file, &realmlist)?;
            }
        }
        tracing::info!(root = %self.root.display(), "Applied settings to game files");
        Ok(())
    }

    /// Last modification time of `Config.wtf` in Unix milliseconds, if it exists.
    pub fn config_modified_millis(&self) -> Option<i64> {
        let modified = fs::metadata(self.config_wtf()).ok()?.modified().ok()?;
        let elapsed = modified.duration_since(std::time::UNIX_EPOCH).ok()?;
        i64::try_from(elapsed.as_millis()).ok()
    }
}

#[cfg(test)]
mod tests {
    use crate::services::settings_schema::SchemaRegistry;

    use super::*;

    fn schema() -> AppResult<SettingsSchema> {
        Ok(SchemaRegistry::load()?.for_expansion("wotlk").clone())
    }

    fn dynamic() -> DynamicDefaults {
        DynamicDefaults {
            display_resolution: Some("2560x1440".to_owned()),
        }
    }

    #[test]
    fn scans_absent_and_present_cvars() -> AppResult<()> {
        let schema = schema()?;
        let config = ConfigWtf::parse(
            b"SET gxWindow \"1\"\r\nSET gxVSync \"0\"\r\nSET Sound_EnableMusic \"0\"\r\n",
        );
        let values = scan(&schema, &config, &dynamic());
        assert_eq!(values["windowed"], SettingValue::Bool(true));
        assert_eq!(values["vsync"], SettingValue::Bool(false));
        assert_eq!(values["sound_enable_music"], SettingValue::Bool(false));
        assert_eq!(values["sound_enable_sfx"], SettingValue::Bool(true));
        assert_eq!(values["shadow_level"], SettingValue::Int(1));
        assert_eq!(
            values["resolution"],
            SettingValue::Text("2560x1440".to_owned())
        );
        assert!(!values.contains_key("launch_args"));
        Ok(())
    }

    #[test]
    fn applies_with_python_parity() -> AppResult<()> {
        let schema = schema()?;
        let mut values = defaults(&schema, &dynamic());
        values.insert("windowed".to_owned(), SettingValue::Bool(true));
        values.insert("vsync".to_owned(), SettingValue::Bool(true));
        values.insert("multisample".to_owned(), SettingValue::Text("4".to_owned()));
        values.insert("sound_enable_music".to_owned(), SettingValue::Bool(false));
        values.insert(
            "realm_list".to_owned(),
            SettingValue::Text("logon.example".to_owned()),
        );

        let mut config = ConfigWtf::parse(b"SET gxVSync \"0\"\r\nSET accountName \"x\"\r\n");
        let realmlist = apply(&schema, &values, &mut config, &dynamic());

        assert_eq!(realmlist.as_deref(), Some("logon.example"));
        assert_eq!(config.get("gxVSync"), None);
        assert_eq!(config.get("gxWindow").as_deref(), Some("1"));
        assert_eq!(config.get("gxMultisample").as_deref(), Some("4"));
        assert_eq!(config.get("Sound_EnableMusic").as_deref(), Some("0"));
        assert_eq!(config.get("Sound_EnableSFX").as_deref(), Some("1"));
        assert_eq!(config.get("shadowLevel"), None);
        assert_eq!(config.get("realmName"), None);
        assert_eq!(config.get("accountName").as_deref(), Some("x"));
        Ok(())
    }

    #[test]
    fn apply_then_scan_round_trips() -> AppResult<()> {
        let schema = schema()?;
        let mut values = defaults(&schema, &dynamic());
        values.insert("farclip".to_owned(), SettingValue::Int(777));
        values.insert("particle_density".to_owned(), SettingValue::Float(0.5));
        values.insert("ffx_glow".to_owned(), SettingValue::Bool(false));
        let mut config = ConfigWtf::default();
        apply(&schema, &values, &mut config, &dynamic());
        assert_eq!(
            scan(&schema, &config, &dynamic()),
            file_backed(&schema, &values)
        );
        Ok(())
    }

    #[test]
    fn normalizes_select_strings_and_unknown_keys() -> AppResult<()> {
        let schema = schema()?;
        let mut values = SettingsValues::new();
        values.insert(
            "refresh_rate".to_owned(),
            SettingValue::Text("144".to_owned()),
        );
        values.insert("legacy".to_owned(), SettingValue::Bool(true));
        let normalized = normalize(&schema, &values, &dynamic());
        assert_eq!(normalized["refresh_rate"], SettingValue::Int(144));
        assert!(!normalized.contains_key("legacy"));
        assert_eq!(normalized.len(), schema.settings().count());
        Ok(())
    }

    #[test]
    fn writes_game_files() -> AppResult<()> {
        let schema = schema()?;
        let directory = tempfile::tempdir()?;
        fs::create_dir_all(directory.path().join("Data").join("esES"))?;
        let exe = directory.path().join("Wow.exe");
        let files = GameFiles::from_exe(&exe.to_string_lossy());

        let mut values = defaults(&schema, &dynamic());
        values.insert(
            "realm_list".to_owned(),
            SettingValue::Text("logon.example".to_owned()),
        );
        files.apply(&schema, &values, &dynamic())?;

        assert_eq!(
            files.scan(&schema, &dynamic())?,
            file_backed(&schema, &values)
        );
        assert_eq!(
            fs::read_to_string(directory.path().join("Data/esES/realmlist.wtf"))?,
            "set realmlist logon.example\r\n"
        );
        assert!(files.config_modified_millis().is_some());
        Ok(())
    }
}

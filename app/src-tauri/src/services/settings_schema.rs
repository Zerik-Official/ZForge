//! Bundled settings schemas.

use std::collections::BTreeMap;

use crate::domain::settings_schema::SettingsSchema;
use crate::error::{AppError, AppResult};

const DEFAULT_SCHEMA_ID: &str = "wow-wotlk-335a";

const BUNDLED_SCHEMAS: &[&str] = &[include_str!("../../resources/schemas/wow/wotlk-335a.json")];

/// Every bundled schema, parsed once at startup.
#[derive(Debug, Clone)]
pub struct SchemaRegistry {
    schemas: BTreeMap<String, SettingsSchema>,
    default: SettingsSchema,
}

impl SchemaRegistry {
    /// Parse the bundled schemas.
    ///
    /// # Errors
    ///
    /// Fails when a bundled schema is invalid or the default schema is missing.
    pub fn load() -> AppResult<Self> {
        let mut schemas = BTreeMap::new();
        for json in BUNDLED_SCHEMAS {
            let schema: SettingsSchema = serde_json::from_str(json)?;
            schemas.insert(schema.id.clone(), schema);
        }
        let default =
            schemas
                .get(DEFAULT_SCHEMA_ID)
                .cloned()
                .ok_or_else(|| AppError::NotFound {
                    entity: "settings schema",
                    id: DEFAULT_SCHEMA_ID.to_owned(),
                })?;
        Ok(Self { schemas, default })
    }

    /// Schema by identifier.
    ///
    /// # Errors
    ///
    /// Returns [`AppError::NotFound`] for unknown identifiers.
    pub fn get(&self, id: &str) -> AppResult<&SettingsSchema> {
        self.schemas.get(id).ok_or_else(|| AppError::NotFound {
            entity: "settings schema",
            id: id.to_owned(),
        })
    }

    /// Schema used for games of an expansion.
    ///
    /// Only the 3.3.5a schema exists today, so every expansion uses it.
    pub fn for_expansion(&self, _expansion: &str) -> &SettingsSchema {
        &self.default
    }

    /// Identifiers of every bundled schema.
    pub fn ids(&self) -> Vec<String> {
        self.schemas.keys().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn bundled_schemas_are_valid() -> AppResult<()> {
        let registry = SchemaRegistry::load()?;
        let schema = registry.get(DEFAULT_SCHEMA_ID)?;
        let mut keys = HashSet::new();
        for setting in schema.settings() {
            assert!(keys.insert(&setting.key), "duplicate key {}", setting.key);
            assert!(
                setting.default.coerce(setting.value_kind()).is_some(),
                "default of {} does not match its type",
                setting.key
            );
        }
        assert_eq!(registry.ids(), [DEFAULT_SCHEMA_ID]);
        Ok(())
    }
}

//! Rich Presence texts, translated by the frontend.
//!
//! The backend never builds user-facing text: the frontend sends these
//! templates in the user's language and the backend only fills placeholders
//! such as `{name}` or `{level}`.

use std::collections::BTreeMap;

use serde::Deserialize;

/// Templates and names shown in Discord.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PresenceStrings {
    /// The game is starting.
    pub launching: String,
    /// The game runs without the SDK.
    pub running: String,
    /// Login screen.
    pub login: String,
    /// Character selection.
    pub character_select: String,
    /// Loading screen.
    pub loading: String,
    /// Character line; placeholders `{name}`, `{level}`.
    pub character: String,
    /// Character line below the level cap; placeholders `{name}`, `{level}`, `{xp}`.
    pub character_xp: String,
    /// Playing alone.
    pub solo: String,
    /// In a party.
    pub party: String,
    /// In a raid.
    pub raid: String,
    /// Status shown before the group; placeholders `{status}`, `{group}`.
    pub status_group: String,
    /// In combat.
    pub in_combat: String,
    /// Dead.
    pub dead: String,
    /// Released as a ghost.
    pub ghost: String,
    /// Away from keyboard.
    pub afk: String,
    /// Race and class line; placeholders `{race}`, `{class}`.
    pub race_class: String,
    /// Zone with sub-zone; placeholders `{zone}`, `{subZone}`.
    pub zone_sub_zone: String,
    /// Zone with the instance difficulty; placeholders `{zone}`, `{difficulty}`.
    pub zone_difficulty: String,
    /// Normal dungeon; placeholder `{players}`.
    pub dungeon_normal: String,
    /// Heroic dungeon; placeholder `{players}`.
    pub dungeon_heroic: String,
    /// Normal raid; placeholder `{players}`.
    pub raid_normal: String,
    /// Heroic raid; placeholder `{players}`.
    pub raid_heroic: String,
    /// Race names by race id.
    pub races: BTreeMap<u32, String>,
    /// Class names by class id.
    pub classes: BTreeMap<u32, String>,
}

/// Replace `{key}` placeholders with their values.
pub fn fill(template: &str, values: &[(&str, &str)]) -> String {
    values
        .iter()
        .fold(template.to_owned(), |text, (key, value)| {
            text.replace(&format!("{{{key}}}"), value)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fills_placeholders_and_parses_ids() -> Result<(), serde_json::Error> {
        assert_eq!(
            fill(
                "{name} · Nivel {level}",
                &[("name", "Zerik"), ("level", "80")]
            ),
            "Zerik · Nivel 80"
        );
        let strings: PresenceStrings = serde_json::from_str(
            r#"{"login":"En el login","classes":{"6":"Caballero de la Muerte"}}"#,
        )?;
        assert_eq!(strings.login, "En el login");
        assert_eq!(
            strings.classes.get(&6).map(String::as_str),
            Some("Caballero de la Muerte")
        );
        Ok(())
    }
}

//! Mapping from the game session to a Discord activity.

use crate::services::presence::strings::{PresenceStrings, fill};
use crate::services::presence::zones::zone_image;
use crate::services::session::{
    GroupKind, InstanceInfo, InstanceKind, SessionPhase, SessionSnapshot,
};

/// Image shown when no better one is known.
const DEFAULT_IMAGE: &str = "wow-icon";

/// Discord rejects texts longer than this.
const MAX_TEXT_CHARS: usize = 128;

/// Party and raid size limits in 3.3.5a.
const PARTY_MAX: i32 = 5;
const RAID_MAX: i32 = 40;

/// Dungeon difficulty `2` is heroic; raid difficulties `3` and `4` are 10 and 25 heroic.
const HEROIC_DUNGEON: u32 = 2;
const FIRST_HEROIC_RAID: u32 = 3;

/// What Discord should show; owned so it can cross threads.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PresenceActivity {
    /// First line.
    pub details: Option<String>,
    /// Second line.
    pub state: Option<String>,
    /// Large image asset key.
    pub large_image: String,
    /// Large image tooltip.
    pub large_text: Option<String>,
    /// Small image asset key.
    pub small_image: Option<String>,
    /// Small image tooltip.
    pub small_text: Option<String>,
    /// Session start in Unix seconds.
    pub start: Option<i64>,
    /// Group size as `[current, max]`.
    pub party: Option<[i32; 2]>,
}

/// Image asset for the continent of a map, uploaded to the Discord application.
fn continent_image(map_id: Option<i64>) -> &'static str {
    match map_id {
        Some(0) => "eastern-kingdoms",
        Some(1) => "kalimdor",
        Some(571) => "northrend",
        _ => DEFAULT_IMAGE,
    }
}

/// Class asset key (`deathknight`, `warrior`…) by class id.
fn class_image(class_id: u32) -> Option<&'static str> {
    Some(match class_id {
        1 => "warrior",
        2 => "paladin",
        3 => "hunter",
        4 => "rogue",
        5 => "priest",
        6 => "deathknight",
        7 => "shaman",
        8 => "mage",
        9 => "warlock",
        11 => "druid",
        _ => return None,
    })
}

/// Translated difficulty of a dungeon or raid; battlegrounds and arenas have none.
fn difficulty_text(instance: &InstanceInfo, strings: &PresenceStrings) -> Option<String> {
    let players = instance.max_players.to_string();
    let template = match (instance.kind, instance.difficulty) {
        (InstanceKind::Party, HEROIC_DUNGEON) => &strings.dungeon_heroic,
        (InstanceKind::Party, _) => &strings.dungeon_normal,
        (InstanceKind::Raid, difficulty) if difficulty >= FIRST_HEROIC_RAID => &strings.raid_heroic,
        (InstanceKind::Raid, _) => &strings.raid_normal,
        (InstanceKind::Pvp | InstanceKind::Arena, _) => return None,
    };
    let filled = fill(template, &[("players", &players)]);
    (!filled.trim().is_empty()).then_some(filled)
}

/// Trim to Discord's length limit without splitting characters; empty texts become `None`.
fn text(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.chars().take(MAX_TEXT_CHARS).collect())
}

fn simple(details: &str, snapshot: &SessionSnapshot, image: &str) -> PresenceActivity {
    PresenceActivity {
        details: text(details.to_owned()),
        large_image: image.to_owned(),
        start: snapshot.started_at.map(|millis| millis / 1000),
        ..PresenceActivity::default()
    }
}

fn status_word<'a>(snapshot: &SessionSnapshot, strings: &'a PresenceStrings) -> Option<&'a str> {
    let status = snapshot.status?;
    if status.ghost {
        Some(&strings.ghost)
    } else if status.dead {
        Some(&strings.dead)
    } else if status.in_combat {
        Some(&strings.in_combat)
    } else if status.afk {
        Some(&strings.afk)
    } else {
        None
    }
}

fn in_world(snapshot: &SessionSnapshot, strings: &PresenceStrings) -> PresenceActivity {
    let mut activity = simple("", snapshot, DEFAULT_IMAGE);

    if let Some(character) = &snapshot.character {
        let level = character.level.to_string();
        let percent = (character.xp.min(character.max_xp) * 100).checked_div(character.max_xp);
        activity.details = if let Some(percent) = percent {
            let percent = percent.to_string();
            text(fill(
                &strings.character_xp,
                &[
                    ("name", &character.name),
                    ("level", &level),
                    ("xp", &percent),
                ],
            ))
        } else {
            text(fill(
                &strings.character,
                &[("name", &character.name), ("level", &level)],
            ))
        };
        activity.small_image = class_image(character.class_id).map(str::to_owned);
        let race = strings
            .races
            .get(&character.race_id)
            .map_or("", String::as_str);
        let class = strings
            .classes
            .get(&character.class_id)
            .map_or("", String::as_str);
        if !race.is_empty() || !class.is_empty() {
            activity.small_text = text(fill(
                &strings.race_class,
                &[("race", race), ("class", class)],
            ));
        }
    }

    let instance = snapshot
        .location
        .as_ref()
        .and_then(|location| location.instance.as_ref());

    if let Some(location) = &snapshot.location {
        activity.large_image = location
            .map_area_id
            .and_then(zone_image)
            .unwrap_or_else(|| continent_image(Some(i64::from(location.map_id))))
            .to_owned();
        let place = if location.sub_zone.is_empty() || location.sub_zone == location.zone {
            location.zone.clone()
        } else {
            fill(
                &strings.zone_sub_zone,
                &[("zone", &location.zone), ("subZone", &location.sub_zone)],
            )
        };
        activity.large_text = match instance.and_then(|instance| difficulty_text(instance, strings))
        {
            Some(difficulty) => text(fill(
                &strings.zone_difficulty,
                &[("zone", &place), ("difficulty", &difficulty)],
            )),
            None => text(place),
        };
    }

    let instance_max = instance
        .filter(|instance| instance.max_players > 0)
        .map(|instance| i32::try_from(instance.max_players).unwrap_or(RAID_MAX));
    let group = snapshot.group.map(|group| {
        let (label, max) = match group.kind {
            GroupKind::Solo => (&strings.solo, None),
            GroupKind::Party => (&strings.party, Some(instance_max.unwrap_or(PARTY_MAX))),
            GroupKind::Raid => (&strings.raid, Some(instance_max.unwrap_or(RAID_MAX))),
        };
        let size = i32::try_from(group.members).unwrap_or(i32::MAX);
        (label.as_str(), max.map(|max| [size.min(max), max]))
    });
    let group_label = group.map_or("", |(label, _)| label);
    activity.party = group.and_then(|(_, party)| party);
    activity.state = match status_word(snapshot, strings) {
        Some(status) if !group_label.is_empty() => text(fill(
            &strings.status_group,
            &[("status", status), ("group", group_label)],
        )),
        Some(status) => text(status.to_owned()),
        None => text(group_label.to_owned()),
    };
    activity
}

/// The activity to show for a session, or `None` to clear the presence.
pub fn build(snapshot: &SessionSnapshot, strings: &PresenceStrings) -> Option<PresenceActivity> {
    Some(match snapshot.phase {
        SessionPhase::Idle => return None,
        SessionPhase::Launching => simple(&strings.launching, snapshot, DEFAULT_IMAGE),
        SessionPhase::Running => simple(&strings.running, snapshot, DEFAULT_IMAGE),
        SessionPhase::Login => simple(&strings.login, snapshot, DEFAULT_IMAGE),
        SessionPhase::CharacterSelect => simple(&strings.character_select, snapshot, DEFAULT_IMAGE),
        SessionPhase::Loading => {
            let map_id = snapshot
                .loading_screen
                .as_ref()
                .and_then(|screen| screen.map_id);
            let mut activity = simple(&strings.loading, snapshot, continent_image(map_id));
            activity.large_text = snapshot
                .loading_screen
                .as_ref()
                .and_then(|screen| screen.background.as_ref())
                .and_then(|background| text(background.name.clone()));
            activity
        }
        SessionPhase::InWorld => in_world(snapshot, strings),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::session::{
        CharacterInfo, GroupInfo, LocationInfo, PlayerStatus, SessionSnapshot,
    };

    fn strings() -> PresenceStrings {
        PresenceStrings {
            login: "En el login".to_owned(),
            character: "{name} · Nivel {level}".to_owned(),
            character_xp: "{name} · Nivel {level} ({xp}% XP)".to_owned(),
            solo: "En solitario".to_owned(),
            party: "En grupo".to_owned(),
            raid: "En banda".to_owned(),
            status_group: "{status} · {group}".to_owned(),
            in_combat: "En combate".to_owned(),
            race_class: "{race} {class}".to_owned(),
            zone_sub_zone: "{zone}, {subZone}".to_owned(),
            zone_difficulty: "{zone} · {difficulty}".to_owned(),
            dungeon_normal: "Normal".to_owned(),
            dungeon_heroic: "Heroica".to_owned(),
            raid_normal: "{players} jugadores".to_owned(),
            raid_heroic: "{players} jugadores · Heroica".to_owned(),
            races: [(10, "Elfo de sangre".to_owned())].into_iter().collect(),
            classes: [(6, "Caballero de la Muerte".to_owned())]
                .into_iter()
                .collect(),
            ..PresenceStrings::default()
        }
    }

    fn playing() -> SessionSnapshot {
        SessionSnapshot {
            phase: SessionPhase::InWorld,
            started_at: Some(1_700_000_000_500),
            character: Some(CharacterInfo {
                name: "Zerik".to_owned(),
                level: 70,
                race_id: 10,
                class_id: 6,
                xp: 450,
                max_xp: 1000,
            }),
            location: Some(LocationInfo {
                map_id: 571,
                zone_id: 4395,
                map_area_id: None,
                zone: "Dalaran".to_owned(),
                sub_zone: "La Ciudadela Violeta".to_owned(),
                instance: None,
            }),
            status: Some(PlayerStatus {
                in_combat: true,
                ..PlayerStatus::default()
            }),
            group: Some(GroupInfo {
                kind: GroupKind::Party,
                members: 3,
            }),
            ..SessionSnapshot::default()
        }
    }

    #[test]
    fn builds_the_in_world_activity() {
        let activity = build(&playing(), &strings());
        assert_eq!(
            activity,
            Some(PresenceActivity {
                details: Some("Zerik · Nivel 70 (45% XP)".to_owned()),
                state: Some("En combate · En grupo".to_owned()),
                large_image: "northrend".to_owned(),
                large_text: Some("Dalaran, La Ciudadela Violeta".to_owned()),
                small_image: Some("deathknight".to_owned()),
                small_text: Some("Elfo de sangre Caballero de la Muerte".to_owned()),
                start: Some(1_700_000_000),
                party: Some([3, 5]),
            })
        );
    }

    #[test]
    fn uses_zone_images_difficulty_and_instance_size() {
        let mut snapshot = playing();
        snapshot.group = Some(GroupInfo {
            kind: GroupKind::Raid,
            members: 25,
        });
        snapshot.location = Some(LocationInfo {
            map_id: 631,
            zone_id: 4812,
            map_area_id: Some(505),
            zone: "Ciudadela de la Corona de Hielo".to_owned(),
            sub_zone: String::new(),
            instance: Some(InstanceInfo {
                kind: InstanceKind::Raid,
                name: "Ciudadela de la Corona de Hielo".to_owned(),
                difficulty: 4,
                max_players: 25,
            }),
        });
        let activity = build(&snapshot, &strings()).unwrap_or_default();
        assert_eq!(activity.large_image, "dalaran");
        assert_eq!(
            activity.large_text.as_deref(),
            Some("Ciudadela de la Corona de Hielo · 25 jugadores · Heroica")
        );
        assert_eq!(activity.party, Some([25, 25]));

        if let Some(location) = snapshot.location.as_mut() {
            location.map_area_id = None;
            location.instance = Some(InstanceInfo {
                kind: InstanceKind::Arena,
                name: "Arena".to_owned(),
                difficulty: 1,
                max_players: 3,
            });
        }
        let arena = build(&snapshot, &strings()).unwrap_or_default();
        assert_eq!(arena.large_image, "wow-icon");
        assert_eq!(
            arena.large_text.as_deref(),
            Some("Ciudadela de la Corona de Hielo")
        );
    }

    #[test]
    fn clears_when_idle_and_shows_glue_screens() {
        assert_eq!(build(&SessionSnapshot::default(), &strings()), None);
        let login = SessionSnapshot {
            phase: SessionPhase::Login,
            ..SessionSnapshot::default()
        };
        let activity = build(&login, &strings());
        assert_eq!(
            activity.and_then(|activity| activity.details),
            Some("En el login".to_owned())
        );
    }

    #[test]
    fn truncates_long_texts() {
        assert_eq!(
            text("x".repeat(200)).map(|value| value.chars().count()),
            Some(128)
        );
        assert_eq!(text("   ".to_owned()), None);
    }
}

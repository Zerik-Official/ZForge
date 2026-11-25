//! Loading screen images on the assets CDN, for the Rich Presence of a loading screen.
//!
//! The SDK reports the `.blp` file of the loading screen, such as
//! `Interface\Glues\LoadingScreens\LoadScreenEasternKingdom.blp`. The CDN keeps every
//! loading screen of the client as a PNG; the file name is looked up, ignoring case, in the
//! table of client files and their CDN names.

use crate::services::resources::CDN_BASE_URL;
use crate::services::sdk::events::LoadingBackground;

/// Client loading screen files in lowercase without extension, sorted, and their CDN names.
const LOADING_SCREENS: &[(&str, &str)] = &[
    ("loadscreenahnqiraj20man", "ahn-qiraj-20-man"),
    ("loadscreenahnqiraj40man", "ahn-qiraj-40-man"),
    ("loadscreenarathibasin", "arathi-basin"),
    ("loadscreenargentdungeon", "argent-dungeon"),
    ("loadscreenargentraid", "argent-raid"),
    ("loadscreenauchindoun", "auchindoun"),
    ("loadscreenazjolnerub76", "azjol-nerub-76"),
    ("loadscreenazjoluppercity", "azjol-upper-city"),
    ("loadscreenblackfathomdeeps", "black-fathom-deeps"),
    ("loadscreenblackrockdepths", "blackrock-depths"),
    ("loadscreenblackrockspire", "blackrock-spire"),
    ("loadscreenblacktemple", "black-temple"),
    ("loadscreenblackwinglair", "black-wing-lair"),
    ("loadscreenbladesedgearena", "blades-edge-arena"),
    ("loadscreencave", "cave"),
    ("loadscreencavernstime", "cavern-of-time"),
    ("loadscreenchamberblack", "chamber-black"),
    ("loadscreenchampionshall", "champions-hall"),
    ("loadscreencoilfang", "coilfang"),
    ("loadscreendalaranprison", "dalaran-prison"),
    ("loadscreendalaransewersarena", "dalaran-sewers-arena"),
    ("loadscreendeadmines", "deadmines"),
    ("loadscreendeathknight", "death-knight"),
    ("loadscreendeepruntram", "deep-run-tram"),
    ("loadscreendiremaul", "dire-maul"),
    ("loadscreendraktharon", "drak-tharon"),
    ("loadscreendraktheron", "drak-theron"),
    ("loadscreendungeon", "dungeon"),
    ("loadscreeneasternkingdom", "eastern-kingdom"),
    ("loadscreeneasternkingdomwide", "eastern-kingdom-wide"),
    ("loadscreenenviroment", "enviroment"),
    ("loadscreengnomeregan", "gnomeregan"),
    ("loadscreengruulslair", "gruuls-lair"),
    ("loadscreengundrak", "gun-drak"),
    ("loadscreenhalloflegends", "hall-of-legends"),
    ("loadscreenhallsofreflection", "halls-of-reflection"),
    ("loadscreenhellfirecitadel", "hellfire-citadel"),
    ("loadscreenhellfirecitadel5man", "hellfire-citadel-5-man"),
    ("loadscreenhellfirecitadelraid", "hellfire-citadel-raid"),
    ("loadscreenhyjal", "hyjal"),
    ("loadscreenicecrown5man", "icecrown-5-man"),
    ("loadscreenicecrowncitadel", "icecrown-citadel"),
    ("loadscreenisleofconquest", "isle-of-conquest"),
    ("loadscreenkalimdor", "kalimdor"),
    ("loadscreenkalimdorwide", "kalimdor-wide"),
    ("loadscreenkarazhan", "karazhan"),
    ("loadscreenmalygos", "malygos"),
    ("loadscreenmaraudon", "maraudon"),
    ("loadscreenmoltencore", "molten-core"),
    ("loadscreenmonastery", "monastery"),
    (
        "loadscreennagrandarenabattlegrounds",
        "nagrand-arena-battlegrounds",
    ),
    ("loadscreennaxxramas", "naxxramas"),
    ("loadscreennetherbattlegrounds", "nether-battlegrounds"),
    ("loadscreennexus70", "nexus-70"),
    ("loadscreennexus80", "nexus-80"),
    ("loadscreennorthrend", "northrend"),
    ("loadscreennorthrendbg", "northrend-bg"),
    ("loadscreennorthrendwide", "northrend-wide"),
    ("loadscreenoldstrathome", "old-strathome"),
    ("loadscreenorgrimmararena", "orgrimmar-arena"),
    ("loadscreenoutland", "outland"),
    ("loadscreenoutlandwide", "outland-wide"),
    ("loadscreenpitofsaron", "pit-of-saron"),
    ("loadscreenpvpbattleground", "pvp-battleground"),
    ("loadscreenragefirechasm", "ragefire-chasm"),
    ("loadscreenraid", "raid"),
    ("loadscreenrazorfendowns", "razorfen-downs"),
    ("loadscreenrazorfenkraul", "razorfen-kraul"),
    ("loadscreenrubysanctum", "ruby-sanctum"),
    ("loadscreenruinedcity", "ruined-city"),
    (
        "loadscreenruinsoflordaeronbattlegrounds",
        "ruins-of-lordaeron-battlegrounds",
    ),
    ("loadscreenscholomance", "scholomance"),
    ("loadscreenshadowfangkeep", "shadow-fang-keep"),
    ("loadscreenstormwindstockade", "stormwind-stockade"),
    ("loadscreenstrathome", "strathome"),
    ("loadscreensunkentemple", "sunken-temple"),
    ("loadscreensunwell", "sunwell"),
    ("loadscreensunwell5man", "sunwell-5-man"),
    ("loadscreentempestkeep", "tempest-keep"),
    ("loadscreenuldaman", "uldaman"),
    ("loadscreenulduar77", "ulduar-77"),
    ("loadscreenulduar80", "ulduar-80"),
    ("loadscreenulduarraid", "ulduar-raid"),
    ("loadscreenutgarde", "utgarde"),
    ("loadscreenutgardepinnecle", "utgarde-pinnecle"),
    ("loadscreenwailingcaverns", "wailing-caverns"),
    ("loadscreenwarsonggulch", "warsong-gulch"),
    ("loadscreenwintergrasp", "wintergrasp"),
    ("loadscreenzulaman", "zul-aman"),
    ("loadscreenzulfarrak", "zul-farrak"),
    ("loadscreenzulgurub", "zul-gurub"),
];

/// Client file name of a loading screen path, in lowercase and without extension.
fn file_key(file: &str) -> String {
    let name = file.rsplit(['\\', '/']).next().unwrap_or(file);
    let stem = name.rsplit_once('.').map_or(name, |(stem, _)| stem);
    stem.to_ascii_lowercase()
}

/// CDN name of a loading screen file, when the CDN has it.
fn cdn_name(file: &str) -> Option<&'static str> {
    let key = file_key(file);
    LOADING_SCREENS
        .binary_search_by(|(known, _)| (*known).cmp(key.as_str()))
        .ok()
        .and_then(|index| LOADING_SCREENS.get(index))
        .map(|(_, name)| *name)
}

/// Continent loading screen of a map, used when the loading screen is unknown.
fn continent(map_id: Option<i64>) -> Option<&'static str> {
    match map_id? {
        0 => Some("eastern-kingdom"),
        1 => Some("kalimdor"),
        530 => Some("outland"),
        571 => Some("northrend"),
        _ => None,
    }
}

/// Address of the loading screen image, or `None` when neither the screen nor its
/// continent is known.
pub fn image_url(background: Option<&LoadingBackground>, map_id: Option<i64>) -> Option<String> {
    let name = background
        .and_then(|background| cdn_name(&background.file))
        .or_else(|| continent(map_id))?;
    Some(format!("{CDN_BASE_URL}/loading-screens/{name}.png"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn background(file: &str) -> LoadingBackground {
        LoadingBackground {
            id: 1,
            name: String::new(),
            file: file.to_owned(),
            has_wide_screen: false,
        }
    }

    #[test]
    fn keeps_the_table_sorted() {
        assert!(LOADING_SCREENS.windows(2).all(|pair| pair[0].0 < pair[1].0));
    }

    #[test]
    fn finds_client_files_ignoring_case() {
        assert_eq!(
            cdn_name(r"Interface\Glues\LoadingScreens\LoadScreenEasternKingdom.blp"),
            Some("eastern-kingdom")
        );
        assert_eq!(
            cdn_name("LOADSCREENCAVERNSTIME.BLP"),
            Some("cavern-of-time")
        );
        assert_eq!(
            cdn_name("LoadScreenHallofLegends.blp"),
            Some("hall-of-legends")
        );
        assert_eq!(cdn_name("LoadScreenSomethingNew.blp"), None);
    }

    #[test]
    fn falls_back_to_the_continent() {
        let known = background(r"Interface\Glues\LoadingScreens\LoadScreenNorthrend.blp");
        assert_eq!(
            image_url(Some(&known), Some(571)),
            Some(format!("{CDN_BASE_URL}/loading-screens/northrend.png"))
        );
        let unknown = background("LoadScreenSomethingNew.blp");
        assert_eq!(
            image_url(Some(&unknown), Some(1)),
            Some(format!("{CDN_BASE_URL}/loading-screens/kalimdor.png"))
        );
        assert_eq!(image_url(None, Some(-1)), None);
    }
}

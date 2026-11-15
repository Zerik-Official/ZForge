//! Discord image keys for zones, indexed by `WorldMapArea` id.
//!
//! The ids are the values of `GetCurrentMapAreaID()` that the SDK reports as
//! `mapAreaId`. The keys match the images uploaded to the Discord application.

use std::collections::BTreeMap;
use std::sync::LazyLock;

const BUNDLED_ZONES_JSON: &str = include_str!("../../../resources/presence/zones.json");

static ZONES: LazyLock<BTreeMap<u32, String>> = LazyLock::new(|| {
    serde_json::from_str(BUNDLED_ZONES_JSON).unwrap_or_else(|error| {
        tracing::error!(%error, "Could not read the bundled zone images");
        BTreeMap::new()
    })
});

/// Image key for a map area, if the Discord application has one.
pub fn zone_image(map_area_id: u32) -> Option<&'static str> {
    ZONES.get(&map_area_id).map(String::as_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_known_areas_and_ignores_unknown_ones() {
        assert_eq!(zone_image(5), Some("durotar"));
        assert_eq!(zone_image(505), Some("dalaran"));
        assert_eq!(zone_image(99_999), None);
    }
}

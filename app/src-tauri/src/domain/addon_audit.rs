//! Problems and risky code found in the installed addons of a game.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// How serious a finding is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    /// Worth knowing; usually harmless.
    Info,
    /// Can be harmless or harmful depending on how the addon uses it.
    Warning,
    /// Can lose items, gold or guild control without the player noticing.
    Danger,
}

/// Something found in an addon: a problem in its `.toc` or a risky piece of code.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddonFinding {
    /// Rule that produced it; the frontend translates its title and explanation.
    pub rule: String,
    /// How serious it is.
    pub severity: Severity,
    /// File inside the addon folder, with forward slashes; empty for folder problems.
    pub file: String,
    /// First line where it appears (1-based); `0` when it applies to the whole file.
    pub line: u32,
    /// How many times it appears in the file.
    pub count: u32,
    /// The code or `.toc` entry where it first appears, trimmed.
    pub excerpt: String,
}

/// Findings of one addon folder.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddonReport {
    /// Most serious finding, if any.
    pub severity: Option<Severity>,
    /// Findings, most serious first.
    pub findings: Vec<AddonFinding>,
}

impl AddonReport {
    /// Build a report from its findings, most serious first.
    pub fn from_findings(mut findings: Vec<AddonFinding>) -> Self {
        findings.sort_by(|a, b| {
            b.severity
                .cmp(&a.severity)
                .then_with(|| a.rule.cmp(&b.rule))
                .then_with(|| a.file.cmp(&b.file))
        });
        Self {
            severity: findings.iter().map(|finding| finding.severity).max(),
            findings,
        }
    }
}

/// Findings of every installed addon of a game, by addon folder.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAudit {
    /// Reports of the addons with at least one finding.
    pub addons: BTreeMap<String, AddonReport>,
    /// How many addon folders were checked.
    pub checked: u32,
}

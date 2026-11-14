//! Starting the World of Warcraft client.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::domain::game::Game;
use crate::domain::game_settings::{SettingValue, SettingsValues};
use crate::error::{AppError, AppResult};

/// Process priority requested in the launch settings.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LaunchPriority {
    /// Default priority.
    Normal,
    /// `HIGH_PRIORITY_CLASS`.
    High,
    /// `REALTIME_PRIORITY_CLASS`.
    Realtime,
}

impl LaunchPriority {
    fn parse(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "high" => Self::High,
            "realtime" => Self::Realtime,
            _ => Self::Normal,
        }
    }

    /// `CreateProcess` priority class flag.
    #[cfg(windows)]
    fn creation_flag(self) -> u32 {
        const HIGH_PRIORITY_CLASS: u32 = 0x0000_0080;
        const REALTIME_PRIORITY_CLASS: u32 = 0x0000_0100;
        match self {
            Self::Normal => 0,
            Self::High => HIGH_PRIORITY_CLASS,
            Self::Realtime => REALTIME_PRIORITY_CLASS,
        }
    }
}

/// Launch behaviour taken from the game's launcher-only settings.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchOptions {
    /// Extra command-line arguments.
    pub arguments: Vec<String>,
    /// Process priority.
    pub priority: LaunchPriority,
    /// Delete the client `Cache` folder before starting.
    pub clear_cache: bool,
}

impl LaunchOptions {
    /// Read the launch options from saved settings.
    pub fn from_settings(values: &SettingsValues) -> Self {
        let text = |key: &str| match values.get(key) {
            Some(SettingValue::Text(text)) => text.clone(),
            _ => String::new(),
        };
        Self {
            arguments: split_arguments(&text("launch_args")),
            priority: LaunchPriority::parse(&text("launch_priority")),
            clear_cache: matches!(
                values.get("clear_cache_on_launch"),
                Some(SettingValue::Bool(true))
            ),
        }
    }
}

/// Split a command line into arguments, honouring double quotes.
pub fn split_arguments(line: &str) -> Vec<String> {
    let mut arguments = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    let mut has_token = false;
    for character in line.chars() {
        match character {
            '"' => {
                quoted = !quoted;
                has_token = true;
            }
            whitespace if whitespace.is_whitespace() && !quoted => {
                if has_token {
                    arguments.push(std::mem::take(&mut current));
                    has_token = false;
                }
            }
            other => {
                current.push(other);
                has_token = true;
            }
        }
    }
    if has_token {
        arguments.push(current);
    }
    arguments
}

fn clear_cache(game_root: &Path) -> AppResult<()> {
    let cache = game_root.join("Cache");
    if cache.is_dir() {
        fs::remove_dir_all(&cache)?;
        tracing::info!(path = %cache.display(), "Cleared client cache");
    }
    Ok(())
}

/// Start the game executable with its launch options.
///
/// # Errors
///
/// Returns [`AppError::GameExecutableMissing`] when the executable does not
/// exist, or fails when the cache cannot be cleared or the process cannot start.
pub fn launch(game: &Game, options: &LaunchOptions) -> AppResult<u32> {
    let exe = PathBuf::from(&game.exe_path);
    if !exe.is_file() {
        return Err(AppError::GameExecutableMissing(game.exe_path.clone()));
    }
    let root = exe.parent().map_or_else(PathBuf::new, Path::to_path_buf);
    if options.clear_cache {
        clear_cache(&root)?;
    }

    let mut command = Command::new(&exe);
    command.args(&options.arguments).current_dir(&root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(options.priority.creation_flag());
    }
    let child = command.spawn()?;
    tracing::info!(game_id = %game.id, pid = child.id(), "Game launched");
    Ok(child.id())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_quoted_arguments() {
        assert_eq!(
            split_arguments(r#"-console  "-path C:\Program Files" """#),
            ["-console", r"-path C:\Program Files", ""]
        );
        assert!(split_arguments("   ").is_empty());
    }

    #[test]
    fn reads_options_from_settings() {
        let mut values = SettingsValues::new();
        values.insert(
            "launch_args".to_owned(),
            SettingValue::Text("-console".to_owned()),
        );
        values.insert(
            "launch_priority".to_owned(),
            SettingValue::Text("HIGH".to_owned()),
        );
        values.insert("clear_cache_on_launch".to_owned(), SettingValue::Bool(true));
        assert_eq!(
            LaunchOptions::from_settings(&values),
            LaunchOptions {
                arguments: vec!["-console".to_owned()],
                priority: LaunchPriority::High,
                clear_cache: true,
            }
        );
    }
}

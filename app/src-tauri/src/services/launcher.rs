//! Starting the World of Warcraft client.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

use crate::domain::game::Game;
use crate::domain::game_settings::{SettingValue, SettingsValues};
use crate::error::{AppError, AppResult};
use crate::services::sdk::auth::SessionToken;
use crate::services::sdk::installation::Installation;

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
    /// Keep the game window hidden until the SDK shows it (SDK 2.2+).
    pub hidden: bool,
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
            hidden: false,
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

/// Validate the executable and clear the cache when requested.
fn prepare(game: &Game, options: &LaunchOptions) -> AppResult<(PathBuf, PathBuf)> {
    let exe = PathBuf::from(&game.exe_path);
    if !exe.is_file() {
        return Err(AppError::GameExecutableMissing(game.exe_path.clone()));
    }
    let root = exe.parent().map_or_else(PathBuf::new, Path::to_path_buf);
    if options.clear_cache {
        clear_cache(&root)?;
    }
    Ok((exe, root))
}

/// Start the game executable directly with its launch options.
///
/// # Errors
///
/// Returns [`AppError::GameExecutableMissing`] when the executable does not
/// exist, or fails when the cache cannot be cleared or the process cannot start.
pub fn launch_direct(game: &Game, options: &LaunchOptions) -> AppResult<Child> {
    let (exe, root) = prepare(game, options)?;
    let mut command = Command::new(&exe);
    command.args(&options.arguments).current_dir(&root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(options.priority.creation_flag());
    }
    let child = command.spawn()?;
    tracing::info!(game_id = %game.id, pid = child.id(), "Game launched");
    Ok(child)
}

/// Join arguments into one command line, quoting those with whitespace.
fn join_arguments(arguments: &[String]) -> String {
    arguments
        .iter()
        .map(|argument| {
            if argument.is_empty() || argument.chars().any(char::is_whitespace) {
                format!("\"{argument}\"")
            } else {
                argument.clone()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Read the game process id from the injector output (`[injector] pid=1234 tid=…`).
fn parse_injector_pid(output: &str) -> Option<u32> {
    output.lines().find_map(|line| {
        let rest = line.split("pid=").nth(1)?;
        rest.split_whitespace().next()?.parse().ok()
    })
}

/// Start the game through `WowInjector.exe`, which injects the SDK and only
/// resumes the game once the SDK pipes are ready. Blocks until the injector exits.
///
/// The process priority option is not applied in this mode. With a session
/// token (SDK 2.0+), the token is written to the injector's standard input so
/// it never appears in a command line.
///
/// # Errors
///
/// Returns [`AppError::SdkInjectionFailed`] when the injector fails, or the
/// errors of [`launch_direct`] for the executable and cache.
pub fn launch_injected(
    game: &Game,
    options: &LaunchOptions,
    sdk: &Installation,
    token: Option<&SessionToken>,
) -> AppResult<u32> {
    let (exe, root) = prepare(game, options)?;
    let mut command = Command::new(sdk.injector_path());
    command
        .arg("--wow")
        .arg(&exe)
        .arg("--dll")
        .arg(sdk.dll_path())
        .current_dir(&root);
    if !options.arguments.is_empty() {
        command
            .arg("--wow-args")
            .arg(join_arguments(&options.arguments));
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    if options.priority != LaunchPriority::Normal {
        tracing::info!("Process priority is not applied when launching through the SDK");
    }
    if token.is_some() {
        command.arg("--token-stdin");
    }
    if options.hidden {
        command.arg("--hidden");
    }
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn()?;
    if let Some(mut stdin) = child.stdin.take()
        && let Some(token) = token
    {
        stdin.write_all(format!("{}\n", token.as_str()).as_bytes())?;
    }
    let output = child.wait_with_output()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::SdkInjectionFailed(
            stderr
                .lines()
                .last()
                .unwrap_or("injector exited with an error")
                .to_owned(),
        ));
    }
    let pid = parse_injector_pid(&stdout).ok_or_else(|| {
        AppError::SdkInjectionFailed("the injector did not report the game process".to_owned())
    })?;
    tracing::info!(game_id = %game.id, pid, "Game launched with the SDK");
    Ok(pid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_injector_output() {
        let output = "[injector] starting C:/WoW/Wow.exe (suspended)\n[injector] pid=4242 tid=17\n[injector] done\n";
        assert_eq!(parse_injector_pid(output), Some(4242));
        assert_eq!(parse_injector_pid("[injector] done"), None);
        assert_eq!(
            join_arguments(&["-console".to_owned(), "a b".to_owned()]),
            r#"-console "a b""#
        );
    }

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
                hidden: false,
            }
        );
    }
}

//! Desktop shortcuts that open the launcher on a game or launch it directly.

use serde::{Deserialize, Serialize};

/// Argument Windows passes when it starts the launcher at sign-in.
pub const AUTOSTART_ARG: &str = "--autostart";

const GAME_ARG: &str = "--game";
const LAUNCH_ARG: &str = "--launch";
const ACCOUNT_ARG: &str = "--account";
const REALM_ARG: &str = "--realm";
const CHARACTER_ARG: &str = "--character";
const HEADLESS_ARG: &str = "--headless";

/// What a game shortcut does when it opens the launcher.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ShortcutAction {
    /// Game to select on Home.
    pub game_id: String,
    /// Launch the game instead of only selecting it.
    pub launch: bool,
    /// Account to log in with; `None` uses the last choice saved for the game.
    pub account_id: Option<String>,
    /// Realm to enter with the account.
    pub realm: Option<String>,
    /// Character to enter the world with.
    pub character: Option<String>,
    /// Start the game hidden until the character is in the world.
    pub headless: bool,
}

impl ShortcutAction {
    /// Command line arguments that reproduce this action.
    pub fn to_args(&self) -> Vec<String> {
        let mut args = vec![GAME_ARG.to_owned(), self.game_id.clone()];
        if !self.launch {
            return args;
        }
        args.push(LAUNCH_ARG.to_owned());
        let options = [
            (ACCOUNT_ARG, &self.account_id),
            (REALM_ARG, &self.realm),
            (CHARACTER_ARG, &self.character),
        ];
        for (name, value) in options {
            if let Some(value) = value.as_deref().filter(|value| !value.trim().is_empty()) {
                args.push(name.to_owned());
                args.push(value.to_owned());
            }
        }
        if self.headless {
            args.push(HEADLESS_ARG.to_owned());
        }
        args
    }

    /// Read an action from command line arguments, or `None` when no game is named.
    pub fn from_args<I, S>(args: I) -> Option<Self>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        let mut action = Self::default();
        let mut args = args.into_iter();
        while let Some(arg) = args.next() {
            match arg.as_ref() {
                GAME_ARG => action.game_id = args.next()?.as_ref().to_owned(),
                LAUNCH_ARG => action.launch = true,
                HEADLESS_ARG => action.headless = true,
                ACCOUNT_ARG => {
                    action.account_id = args.next().map(|value| value.as_ref().to_owned())
                }
                REALM_ARG => action.realm = args.next().map(|value| value.as_ref().to_owned()),
                CHARACTER_ARG => {
                    action.character = args.next().map(|value| value.as_ref().to_owned())
                }
                _ => {}
            }
        }
        (!action.game_id.trim().is_empty()).then_some(action)
    }
}

/// Whether Windows started the launcher at sign-in.
pub fn started_by_autostart<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().any(|arg| arg.as_ref() == AUTOSTART_ARG)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_a_launch_with_an_account() {
        let action = ShortcutAction {
            game_id: "game-1".into(),
            launch: true,
            account_id: Some("account-1".into()),
            realm: Some("Icecrown".into()),
            character: Some("Zerik".into()),
            headless: true,
        };
        let mut args = vec!["ZForge.exe".to_owned()];
        args.extend(action.to_args());
        assert_eq!(ShortcutAction::from_args(&args), Some(action));
    }

    #[test]
    fn opening_a_game_only_names_it() {
        let action = ShortcutAction {
            game_id: "game-1".into(),
            account_id: Some("ignored".into()),
            ..ShortcutAction::default()
        };
        assert_eq!(action.to_args(), vec!["--game", "game-1"]);
    }

    #[test]
    fn needs_a_game() {
        assert_eq!(ShortcutAction::from_args(["ZForge.exe", "--launch"]), None);
        assert!(started_by_autostart(["ZForge.exe", AUTOSTART_ARG]));
    }
}

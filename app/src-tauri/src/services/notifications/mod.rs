//! Windows notifications about the running game (SDK 2.1+).
//!
//! A tokio task listens to the social events of the [`GameSession`] and turns
//! the ones the user enabled into Windows toasts. Toasts that need an answer
//! (group invitations, summons, Dungeon Finder, trades, duels, battlegrounds)
//! carry buttons; pressing one sends the matching native action to the SDK,
//! and clicking the toast itself brings the game to the foreground.

pub mod focus;
pub mod strings;

use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, Runtime};
use tauri_winrt_notification::{Scenario, Toast};
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::{mpsc, watch};

use crate::domain::app_config::NotificationSettings;
use crate::services::notifications::strings::{NotificationStrings, NotificationText};
use crate::services::presence::strings::fill;
use crate::services::sdk::api::GameAction;
use crate::services::sdk::social::SocialEvent;
use crate::services::session::GameSession;

/// Whispers longer than this are shortened in the toast.
const MAX_WHISPER_CHARS: usize = 200;

/// A trade window opened this soon after a request comes from that request,
/// which was already notified.
const TRADE_REQUEST_WINDOW: Duration = Duration::from_secs(60);

/// A toast ready to be shown.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToastSpec {
    /// First line.
    pub title: String,
    /// Second line.
    pub body: String,
    /// Buttons with the action each one performs.
    pub buttons: Vec<(String, GameAction)>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct NotificationState {
    settings: NotificationSettings,
    strings: Option<NotificationStrings>,
}

/// Handle to the running notification service.
#[derive(Debug)]
pub struct NotificationService {
    state: watch::Sender<NotificationState>,
}

impl NotificationService {
    /// Start listening to the game session.
    pub fn start<R: Runtime>(app: AppHandle<R>, settings: NotificationSettings) -> Self {
        let (state, state_changes) = watch::channel(NotificationState {
            settings,
            strings: None,
        });
        let service = Self { state };

        let Some(session) = app.try_state::<GameSession>() else {
            tracing::error!("Notifications disabled: the game session is not available");
            return service;
        };
        let mut events = session.subscribe_social();
        let (actions, mut pending_actions) = mpsc::unbounded_channel::<GameAction>();

        let action_app = app.clone();
        tauri::async_runtime::spawn(async move {
            while let Some(action) = pending_actions.recv().await {
                let Some(session) = action_app.try_state::<GameSession>() else {
                    break;
                };
                if let Err(error) = session.api().perform(action).await {
                    tracing::warn!(%error, method = action.method(), "Notification action failed");
                }
            }
        });

        let app_id = app_id(&app);
        tauri::async_runtime::spawn(async move {
            let mut last_trade_request: Option<Instant> = None;
            loop {
                let event = match events.recv().await {
                    Ok(event) => event,
                    Err(RecvError::Lagged(skipped)) => {
                        tracing::debug!(skipped, "Skipped game events while notifying");
                        continue;
                    }
                    Err(RecvError::Closed) => break,
                };
                match &event {
                    SocialEvent::TradeRequested(_) => last_trade_request = Some(Instant::now()),
                    SocialEvent::TradeOpened(_)
                        if last_trade_request
                            .is_some_and(|at| at.elapsed() < TRADE_REQUEST_WINDOW) =>
                    {
                        continue;
                    }
                    _ => {}
                }
                let current = state_changes.borrow().clone();
                let Some(strings) = current.strings.as_ref() else {
                    continue;
                };
                let Some(spec) = build(&event, &current.settings, strings) else {
                    continue;
                };
                if current.settings.only_when_unfocused && game_in_foreground(&app) {
                    continue;
                }
                let app_id = app_id.clone();
                let actions = actions.clone();
                tauri::async_runtime::spawn_blocking(move || show(&spec, &app_id, actions));
            }
        });
        service
    }

    /// Use new notification settings.
    pub fn set_settings(&self, settings: NotificationSettings) {
        self.state.send_if_modified(|state| {
            let changed = state.settings != settings;
            state.settings = settings;
            changed
        });
    }

    /// Use new translated texts.
    pub fn set_strings(&self, strings: NotificationStrings) {
        self.state.send_if_modified(|state| {
            let changed = state.strings.as_ref() != Some(&strings);
            state.strings = Some(strings);
            changed
        });
    }
}

/// `AppUserModelID` used for toasts. Development builds are not registered
/// with Windows, so they borrow PowerShell's id to be able to show toasts.
fn app_id<R: Runtime>(app: &AppHandle<R>) -> String {
    if cfg!(debug_assertions) {
        Toast::POWERSHELL_APP_ID.to_owned()
    } else {
        app.config().identifier.clone()
    }
}

fn game_in_foreground<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.try_state::<GameSession>()
        .and_then(|session| session.game_pid())
        .is_some_and(focus::is_process_foreground)
}

fn show(spec: &ToastSpec, app_id: &str, actions: mpsc::UnboundedSender<GameAction>) {
    let mut toast = Toast::new(app_id).title(&spec.title).text1(&spec.body);
    if !spec.buttons.is_empty() {
        toast = toast.scenario(Scenario::Reminder);
    }
    for (label, action) in &spec.buttons {
        toast = toast.add_button(label, &action_id(*action));
    }
    toast = toast.on_activated(move |argument| {
        let action = argument
            .as_deref()
            .and_then(parse_action_id)
            .unwrap_or(GameAction::FocusWindow);
        if actions.send(action).is_err() {
            tracing::debug!("Notification action dropped: the launcher is closing");
        }
        Ok(())
    });
    if let Err(error) = toast.show() {
        tracing::warn!(%error, "Could not show a Windows notification");
    }
}

/// Argument attached to a toast button.
fn action_id(action: GameAction) -> String {
    match action {
        GameAction::EnterBattlefield(index) | GameAction::LeaveBattlefield(index) => {
            format!("{}:{index}", action.method())
        }
        _ => action.method().to_owned(),
    }
}

/// Action of a toast button argument.
fn parse_action_id(id: &str) -> Option<GameAction> {
    let (method, index) = match id.split_once(':') {
        Some((method, index)) => (method, Some(index.parse::<u32>().ok()?)),
        None => (id, None),
    };
    let action = match (method, index) {
        ("battlefield.acceptPort", Some(index)) => GameAction::EnterBattlefield(index),
        ("battlefield.leaveQueue", Some(index)) => GameAction::LeaveBattlefield(index),
        (_, Some(_)) => return None,
        (method, None) => [
            GameAction::AcceptInvite,
            GameAction::DeclineInvite,
            GameAction::AcceptSummon,
            GameAction::DeclineSummon,
            GameAction::AcceptProposal,
            GameAction::RejectProposal,
            GameAction::AcceptTradeRequest,
            GameAction::DeclineTradeRequest,
            GameAction::CancelTrade,
            GameAction::AcceptDuel,
            GameAction::DeclineDuel,
            GameAction::FocusWindow,
        ]
        .into_iter()
        .find(|action| action.method() == method)?,
    };
    Some(action)
}

fn text(template: &NotificationText, values: &[(&str, &str)]) -> Option<(String, String)> {
    let title = fill(&template.title, values);
    if title.trim().is_empty() {
        return None;
    }
    Some((title, fill(&template.body, values)))
}

fn shorten(value: &str, max: usize) -> String {
    if value.chars().count() <= max {
        value.to_owned()
    } else {
        let mut short: String = value.chars().take(max).collect();
        short.push('\u{2026}');
        short
    }
}

/// The toast for an event, or `None` when the user disabled it or it needs none.
pub fn build(
    event: &SocialEvent,
    settings: &NotificationSettings,
    strings: &NotificationStrings,
) -> Option<ToastSpec> {
    if !settings.enabled {
        return None;
    }
    let answer = |accept: GameAction, decline: GameAction| {
        vec![
            (strings.accept.clone(), accept),
            (strings.decline.clone(), decline),
        ]
    };
    let (texts, buttons) = match event {
        SocialEvent::FriendOnline(friend) if settings.friends => {
            let level = friend.level.to_string();
            let values = [
                ("name", friend.name.as_str()),
                ("level", level.as_str()),
                ("class", friend.class_name.as_str()),
                ("zone", friend.area_name.as_str()),
            ];
            (text(&strings.friend_online, &values)?, Vec::new())
        }
        SocialEvent::FriendOffline(friend) if settings.friends => (
            text(&strings.friend_offline, &[("name", friend.name.as_str())])?,
            Vec::new(),
        ),
        SocialEvent::Whisper(whisper) if settings.whispers => {
            let message = shorten(&whisper.text, MAX_WHISPER_CHARS);
            (
                text(
                    &strings.whisper,
                    &[
                        ("name", whisper.author.as_str()),
                        ("text", message.as_str()),
                    ],
                )?,
                Vec::new(),
            )
        }
        SocialEvent::InviteReceived(invite) if settings.group_invites => (
            text(&strings.invite, &[("name", invite.inviter_name.as_str())])?,
            answer(GameAction::AcceptInvite, GameAction::DeclineInvite),
        ),
        SocialEvent::SummonRequested(summon) if settings.summons => (
            text(
                &strings.summon,
                &[
                    ("name", summon.summoner_name.as_str()),
                    ("zone", summon.area_name.as_str()),
                ],
            )?,
            answer(GameAction::AcceptSummon, GameAction::DeclineSummon),
        ),
        SocialEvent::ProposalShown(proposal) if settings.dungeon_finder && proposal.exists => {
            let role = strings.roles.get(&proposal.role).map_or("", String::as_str);
            (
                text(
                    &strings.proposal,
                    &[("dungeon", proposal.dungeon.name.as_str()), ("role", role)],
                )?,
                vec![
                    (strings.enter.clone(), GameAction::AcceptProposal),
                    (strings.leave_queue.clone(), GameAction::RejectProposal),
                ],
            )
        }
        SocialEvent::TradeRequested(trade) if settings.trades => (
            text(&strings.trade, &[("name", trade.requester_name.as_str())])?,
            answer(
                GameAction::AcceptTradeRequest,
                GameAction::DeclineTradeRequest,
            ),
        ),
        SocialEvent::TradeOpened(trade) if settings.trades => (
            text(
                &strings.trade_opened,
                &[("name", trade.trader_name.as_str())],
            )?,
            vec![(strings.decline.clone(), GameAction::CancelTrade)],
        ),
        SocialEvent::DuelRequested(duel) if settings.duels => (
            text(&strings.duel, &[("name", duel.challenger_name.as_str())])?,
            answer(GameAction::AcceptDuel, GameAction::DeclineDuel),
        ),
        SocialEvent::BattlefieldReady(ready) if settings.battlegrounds => {
            let size = ready.team_size.to_string();
            let texts = if ready.arena {
                text(
                    &strings.arena,
                    &[("map", ready.map_name.as_str()), ("size", size.as_str())],
                )?
            } else {
                text(&strings.battleground, &[("map", ready.map_name.as_str())])?
            };
            let mut buttons = vec![(
                strings.enter.clone(),
                GameAction::EnterBattlefield(ready.index),
            )];
            if ready.can_leave {
                buttons.push((
                    strings.leave_queue.clone(),
                    GameAction::LeaveBattlefield(ready.index),
                ));
            }
            (texts, buttons)
        }
        _ => return None,
    };
    let (title, body) = texts;
    Some(ToastSpec {
        title,
        body,
        buttons: buttons
            .into_iter()
            .filter(|(label, _)| !label.trim().is_empty())
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::sdk::social::{
        BattlefieldEvent, FriendEvent, InviteEvent, TradeOpenedEvent, WhisperEvent,
    };

    fn strings() -> NotificationStrings {
        let text = |title: &str, body: &str| NotificationText {
            title: title.to_owned(),
            body: body.to_owned(),
        };
        NotificationStrings {
            friend_online: text("{name} se ha conectado", "Nivel {level} {class} · {zone}"),
            whisper: text("{name} te susurra", "{text}"),
            invite: text("Invitación a grupo", "{name} te invita a su grupo"),
            trade_opened: text("Comercio con {name}", "Revisa los objetos en el juego"),
            battleground: text("{map} está listo", "Entra antes de que caduque"),
            arena: text("Arena {size}c{size}", "{map}"),
            accept: "Aceptar".to_owned(),
            decline: "Rechazar".to_owned(),
            enter: "Entrar".to_owned(),
            leave_queue: "Abandonar cola".to_owned(),
            ..NotificationStrings::default()
        }
    }

    fn enabled() -> NotificationSettings {
        NotificationSettings {
            enabled: true,
            ..NotificationSettings::default()
        }
    }

    #[test]
    fn builds_toasts_with_answers() {
        let invite = SocialEvent::InviteReceived(InviteEvent {
            inviter_name: "Jaina".to_owned(),
        });
        assert_eq!(
            build(&invite, &enabled(), &strings()),
            Some(ToastSpec {
                title: "Invitación a grupo".to_owned(),
                body: "Jaina te invita a su grupo".to_owned(),
                buttons: vec![
                    ("Aceptar".to_owned(), GameAction::AcceptInvite),
                    ("Rechazar".to_owned(), GameAction::DeclineInvite),
                ],
            })
        );

        let friend = SocialEvent::FriendOnline(FriendEvent {
            name: "Thrall".to_owned(),
            level: 80,
            class_name: "Chamán".to_owned(),
            area_name: "Orgrimmar".to_owned(),
        });
        let toast = build(&friend, &enabled(), &strings());
        assert_eq!(
            toast.map(|toast| (toast.title, toast.body, toast.buttons.len())),
            Some((
                "Thrall se ha conectado".to_owned(),
                "Nivel 80 Chamán · Orgrimmar".to_owned(),
                0
            ))
        );
    }

    #[test]
    fn respects_settings_and_arena_rules() {
        let whisper = SocialEvent::Whisper(WhisperEvent {
            author: "Arthas".to_owned(),
            text: "x".repeat(300),
            battle_net: false,
        });
        assert_eq!(
            build(&whisper, &NotificationSettings::default(), &strings()),
            None
        );
        let quiet = NotificationSettings {
            whispers: false,
            ..enabled()
        };
        assert_eq!(build(&whisper, &quiet, &strings()), None);
        let body = build(&whisper, &enabled(), &strings()).map(|toast| toast.body);
        assert_eq!(body.map(|body| body.chars().count()), Some(201));

        let arena = SocialEvent::BattlefieldReady(BattlefieldEvent {
            index: 2,
            map_name: "Ruinas de Lordaeron".to_owned(),
            arena: true,
            rated: true,
            team_size: 3,
            can_leave: false,
        });
        let toast = build(&arena, &enabled(), &strings());
        assert_eq!(
            toast.map(|toast| (toast.title, toast.buttons)),
            Some((
                "Arena 3c3".to_owned(),
                vec![("Entrar".to_owned(), GameAction::EnterBattlefield(2))]
            ))
        );
        assert_eq!(
            build(&SocialEvent::InviteClosed, &enabled(), &strings()),
            None
        );

        let trade = SocialEvent::TradeOpened(TradeOpenedEvent {
            trader_name: "Thrall".to_owned(),
        });
        let toast = build(&trade, &enabled(), &strings());
        assert_eq!(
            toast.map(|toast| (toast.title, toast.buttons)),
            Some((
                "Comercio con Thrall".to_owned(),
                vec![("Rechazar".to_owned(), GameAction::CancelTrade)]
            ))
        );
    }

    #[test]
    fn encodes_and_decodes_button_actions() {
        for action in [
            GameAction::AcceptInvite,
            GameAction::DeclineSummon,
            GameAction::EnterBattlefield(1),
            GameAction::LeaveBattlefield(2),
            GameAction::FocusWindow,
        ] {
            assert_eq!(parse_action_id(&action_id(action)), Some(action));
        }
        assert_eq!(parse_action_id("lua.execute"), None);
        assert_eq!(parse_action_id("group.acceptInvite:1"), None);
    }
}

//! Windows notifications about the running game (SDK 2.1+).
//!
//! A tokio task listens to the social events of the [`GameSession`] and turns
//! the ones the user enabled into Windows toasts. Toasts that need an answer
//! (group invitations, summons, Dungeon Finder, trades, duels, battlegrounds)
//! carry buttons; pressing one sends the matching native action to the SDK.
//! Whisper toasts carry a text box to answer with `chat.reply` (SDK 2.2+).
//! Clicking the toast itself brings the game to the foreground.

pub mod focus;
pub mod strings;
pub mod toast;

use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::{mpsc, watch};

use crate::domain::app_config::NotificationSettings;
use crate::paths::AppPaths;
use crate::services::notifications::strings::{NotificationStrings, NotificationText};
use crate::services::notifications::toast::{Activation, POWERSHELL_APP_ID, Toast, ToastButton};
use crate::services::presence::strings::fill;
use crate::services::resources;
use crate::services::sdk::api::GameAction;
use crate::services::sdk::social::SocialEvent;
use crate::services::session::GameSession;

/// Whispers longer than this are shortened in the toast.
const MAX_WHISPER_CHARS: usize = 200;

/// A trade window opened this soon after a request comes from that request,
/// which was already notified.
const TRADE_REQUEST_WINDOW: Duration = Duration::from_secs(60);

/// Arguments of the button that sends a whisper reply.
const REPLY_ARGUMENTS: &str = "chat.reply";

/// A toast ready to be shown.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToastSpec {
    /// First line.
    pub title: String,
    /// Second line.
    pub body: String,
    /// Buttons with the action each one performs.
    pub buttons: Vec<(String, GameAction)>,
    /// Text box to answer a whisper.
    pub reply: Option<WhisperReply>,
    /// Portrait of the other player, as a `file:///` address.
    pub image: Option<String>,
}

/// A text box and button that answer a whisper with `chat.reply`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WhisperReply {
    /// Chat line of the whisper; `None` answers the last whisper received.
    pub line_id: Option<u64>,
    /// Placeholder of the text box.
    pub placeholder: String,
    /// Label of the send button.
    pub button: String,
}

/// What the user asked for from a toast.
#[derive(Debug, Clone, PartialEq, Eq)]
enum ToastAnswer {
    /// A native action, or bringing the game to the foreground.
    Action(GameAction),
    /// Answer a whisper with this text.
    Reply { line_id: Option<u64>, text: String },
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
        let (answers, mut pending_answers) = mpsc::unbounded_channel::<ToastAnswer>();

        let answer_app = app.clone();
        tauri::async_runtime::spawn(async move {
            while let Some(answer) = pending_answers.recv().await {
                let Some(session) = answer_app.try_state::<GameSession>() else {
                    break;
                };
                match answer {
                    ToastAnswer::Action(action) => {
                        if let Err(error) = session.api().perform(action).await {
                            tracing::warn!(%error, method = action.method(), "Notification action failed");
                        }
                    }
                    ToastAnswer::Reply { line_id, text } => {
                        if let Err(error) = session.api().reply_whisper(line_id, &text).await {
                            tracing::warn!(%error, "Whisper reply failed");
                        }
                    }
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
                let Some(mut spec) = build(&event, &current.settings, strings) else {
                    continue;
                };
                if let (Some(player), Some(paths)) = (event.player(), app.try_state::<AppPaths>()) {
                    spec.image = resources::toast_portrait(
                        &paths.resources_dir(),
                        player.race,
                        player.gender,
                    )
                    .map(|path| {
                        format!("file:///{}", path.display().to_string().replace('\\', "/"))
                    });
                }
                if current.settings.only_when_unfocused && game_in_foreground(&app) {
                    continue;
                }
                let app_id = app_id.clone();
                let answers = answers.clone();
                tauri::async_runtime::spawn_blocking(move || show(&spec, &app_id, answers));
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
        POWERSHELL_APP_ID.to_owned()
    } else {
        app.config().identifier.clone()
    }
}

fn game_in_foreground<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.try_state::<GameSession>()
        .and_then(|session| session.game_pid())
        .is_some_and(focus::is_process_foreground)
}

fn show(spec: &ToastSpec, app_id: &str, answers: mpsc::UnboundedSender<ToastAnswer>) {
    let mut buttons: Vec<ToastButton> = Vec::new();
    if let Some(reply) = &spec.reply {
        buttons.push(ToastButton {
            label: reply.button.clone(),
            arguments: REPLY_ARGUMENTS.to_owned(),
            uses_input: true,
        });
    }
    buttons.extend(spec.buttons.iter().map(|(label, action)| ToastButton {
        label: label.clone(),
        arguments: action_id(*action),
        uses_input: false,
    }));
    let toast = Toast {
        title: spec.title.clone(),
        body: spec.body.clone(),
        reminder: !spec.buttons.is_empty(),
        input_placeholder: spec.reply.as_ref().map(|reply| reply.placeholder.clone()),
        buttons,
        image: spec.image.clone(),
    };
    let line_id = spec.reply.as_ref().and_then(|reply| reply.line_id);
    let result = toast.show(app_id, move |activation| {
        let Some(answer) = answer_for(&activation, line_id) else {
            return;
        };
        if answers.send(answer).is_err() {
            tracing::debug!("Notification answer dropped: the launcher is closing");
        }
    });
    if let Err(error) = result {
        tracing::warn!(%error, "Could not show a Windows notification");
    }
}

/// What a click on a toast asks for; `None` for a reply sent without text.
fn answer_for(activation: &Activation, line_id: Option<u64>) -> Option<ToastAnswer> {
    if activation.arguments == REPLY_ARGUMENTS {
        let text = activation.input.as_deref().unwrap_or_default().trim();
        return (!text.is_empty()).then(|| ToastAnswer::Reply {
            line_id,
            text: text.to_owned(),
        });
    }
    let action = parse_action_id(&activation.arguments).unwrap_or(GameAction::FocusWindow);
    Some(ToastAnswer::Action(action))
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
    let mut reply: Option<WhisperReply> = None;
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
            let texts = text(
                &strings.whisper,
                &[
                    ("name", whisper.author.as_str()),
                    ("text", message.as_str()),
                ],
            )?;
            if !strings.reply.trim().is_empty() {
                reply = Some(WhisperReply {
                    line_id: (whisper.line_id != 0).then_some(whisper.line_id),
                    placeholder: strings.reply_placeholder.clone(),
                    button: strings.reply.clone(),
                });
            }
            (texts, Vec::new())
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
        reply,
        image: None,
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
            reply: "Responder".to_owned(),
            reply_placeholder: "Escribe una respuesta".to_owned(),
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
            player: None,
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
                reply: None,
                image: None,
            })
        );

        let friend = SocialEvent::FriendOnline(FriendEvent {
            player: None,
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
            player: None,
            author: "Arthas".to_owned(),
            text: "x".repeat(300),
            battle_net: false,
            line_id: 0,
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
            player: None,
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
    fn whispers_offer_a_reply_box() {
        let whisper = SocialEvent::Whisper(WhisperEvent {
            player: None,
            author: "Jaina".to_owned(),
            text: "¿Vienes?".to_owned(),
            battle_net: false,
            line_id: 7,
        });
        let reply = build(&whisper, &enabled(), &strings()).and_then(|toast| toast.reply);
        assert_eq!(
            reply,
            Some(WhisperReply {
                line_id: Some(7),
                placeholder: "Escribe una respuesta".to_owned(),
                button: "Responder".to_owned(),
            })
        );

        let untranslated = NotificationStrings {
            reply: String::new(),
            ..strings()
        };
        let toast = build(&whisper, &enabled(), &untranslated);
        assert_eq!(toast.map(|toast| toast.reply), Some(None));
    }

    #[test]
    fn turns_clicks_into_answers() {
        let click = |arguments: &str, input: Option<&str>| Activation {
            arguments: arguments.to_owned(),
            input: input.map(str::to_owned),
        };
        assert_eq!(
            answer_for(&click(REPLY_ARGUMENTS, Some("  ya voy ")), Some(3)),
            Some(ToastAnswer::Reply {
                line_id: Some(3),
                text: "ya voy".to_owned(),
            })
        );
        assert_eq!(answer_for(&click(REPLY_ARGUMENTS, Some("  ")), None), None);
        assert_eq!(answer_for(&click(REPLY_ARGUMENTS, None), None), None);
        assert_eq!(
            answer_for(&click("summon.accept", None), None),
            Some(ToastAnswer::Action(GameAction::AcceptSummon))
        );
        assert_eq!(
            answer_for(&click("", None), None),
            Some(ToastAnswer::Action(GameAction::FocusWindow))
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

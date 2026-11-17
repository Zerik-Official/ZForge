//! Windows toasts built directly on the WinRT notification API.
//!
//! A toast has a title, a body, buttons and an optional text box. When the
//! user clicks the toast or one of its buttons, the button arguments and the
//! typed text are handed to a callback.

use windows::Data::Xml::Dom::{XmlDocument, XmlElement};
use windows::Foundation::{IReference, TypedEventHandler};
use windows::UI::Notifications::{
    ToastActivatedEventArgs, ToastNotification, ToastNotificationManager,
};
use windows::core::{HSTRING, IInspectable, Interface, Ref};

/// `AppUserModelID` of PowerShell, borrowed by builds not registered with Windows.
pub const POWERSHELL_APP_ID: &str =
    "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

/// Id of the toast text box in the activation inputs.
const INPUT_ID: &str = "input";

/// A toast button.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToastButton {
    /// Button text.
    pub label: String,
    /// Arguments reported when the button is pressed.
    pub arguments: String,
    /// Whether the button sits next to the text box and sends its text.
    pub uses_input: bool,
}

/// A Windows toast ready to be shown.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Toast {
    /// First line, shown in bold.
    pub title: String,
    /// Second line.
    pub body: String,
    /// Keep the toast on screen until the user answers.
    pub reminder: bool,
    /// Placeholder of the text box; `None` shows no text box.
    pub input_placeholder: Option<String>,
    /// Buttons, in order.
    pub buttons: Vec<ToastButton>,
}

/// What the user did on a toast.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Activation {
    /// Arguments of the pressed button; empty when the toast itself was clicked.
    pub arguments: String,
    /// Text typed in the text box, if any.
    pub input: Option<String>,
}

impl Toast {
    /// Show the toast; `on_activated` runs on a Windows thread when the user clicks it.
    ///
    /// # Errors
    ///
    /// Fails when Windows rejects the toast or the app id.
    pub fn show<F>(&self, app_id: &str, on_activated: F) -> windows::core::Result<()>
    where
        F: Fn(Activation) + Send + 'static,
    {
        let notification = ToastNotification::CreateToastNotification(&self.document()?)?;
        let handler = TypedEventHandler::<ToastNotification, IInspectable>::new(
            move |_: Ref<'_, ToastNotification>, args: Ref<'_, IInspectable>| {
                let activation = args
                    .as_ref()
                    .and_then(|args| args.cast::<ToastActivatedEventArgs>().ok())
                    .map(|args| read_activation(&args))
                    .unwrap_or_default();
                on_activated(activation);
                Ok(())
            },
        );
        notification.Activated(&handler)?;
        ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(app_id))?
            .Show(&notification)
    }

    /// The toast XML.
    fn document(&self) -> windows::core::Result<XmlDocument> {
        let document = XmlDocument::new()?;
        let toast = document.CreateElement(&HSTRING::from("toast"))?;
        if self.reminder {
            set(&toast, "scenario", "reminder")?;
        }

        let visual = document.CreateElement(&HSTRING::from("visual"))?;
        let binding = document.CreateElement(&HSTRING::from("binding"))?;
        set(&binding, "template", "ToastGeneric")?;
        for line in [&self.title, &self.body] {
            let text = document.CreateElement(&HSTRING::from("text"))?;
            text.SetInnerText(&HSTRING::from(line.as_str()))?;
            binding.AppendChild(&text)?;
        }
        visual.AppendChild(&binding)?;
        toast.AppendChild(&visual)?;

        if self.input_placeholder.is_some() || !self.buttons.is_empty() {
            let actions = document.CreateElement(&HSTRING::from("actions"))?;
            if let Some(placeholder) = &self.input_placeholder {
                let input = document.CreateElement(&HSTRING::from("input"))?;
                set(&input, "id", INPUT_ID)?;
                set(&input, "type", "text")?;
                set(&input, "placeHolderContent", placeholder)?;
                actions.AppendChild(&input)?;
            }
            for button in &self.buttons {
                let action = document.CreateElement(&HSTRING::from("action"))?;
                set(&action, "content", &button.label)?;
                set(&action, "arguments", &button.arguments)?;
                if button.uses_input && self.input_placeholder.is_some() {
                    set(&action, "hint-inputId", INPUT_ID)?;
                }
                actions.AppendChild(&action)?;
            }
            toast.AppendChild(&actions)?;
        }

        document.AppendChild(&toast)?;
        Ok(document)
    }
}

fn set(element: &XmlElement, name: &str, value: &str) -> windows::core::Result<()> {
    element.SetAttribute(&HSTRING::from(name), &HSTRING::from(value))
}

fn read_activation(args: &ToastActivatedEventArgs) -> Activation {
    let arguments = args
        .Arguments()
        .map(|arguments| arguments.to_string())
        .unwrap_or_default();
    let input = args
        .UserInput()
        .and_then(|inputs| inputs.Lookup(&HSTRING::from(INPUT_ID)))
        .and_then(|value| value.cast::<IReference<HSTRING>>())
        .and_then(|value| value.Value())
        .map(|value| value.to_string())
        .ok();
    Activation { arguments, input }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_the_toast_xml() -> windows::core::Result<()> {
        let toast = Toast {
            title: "Thrall <whispers>".to_owned(),
            body: "a & b".to_owned(),
            reminder: false,
            input_placeholder: Some("Reply".to_owned()),
            buttons: vec![ToastButton {
                label: "Send".to_owned(),
                arguments: "chat.reply".to_owned(),
                uses_input: true,
            }],
        };
        let xml = toast.document()?.GetXml()?.to_string();
        assert!(xml.contains("Thrall &lt;whispers&gt;"));
        assert!(xml.contains("a &amp; b"));
        assert!(!xml.contains("scenario"));
        assert!(xml.contains(r#"<input id="input" type="text" placeHolderContent="Reply"/>"#));
        assert!(xml.contains(r#"hint-inputId="input""#));

        let plain = Toast {
            title: "Title".to_owned(),
            reminder: true,
            ..Toast::default()
        };
        let xml = plain.document()?.GetXml()?.to_string();
        assert!(xml.contains(r#"scenario="reminder""#));
        assert!(!xml.contains("<actions"));
        Ok(())
    }
}

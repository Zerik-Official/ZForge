//! Information about the user's machine: monitors and audio devices.

use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;
use tauri::{AppHandle, Runtime};

use crate::services::game_config::DynamicDefaults;

const FALLBACK_RESOLUTION: Resolution = Resolution {
    width: 1920,
    height: 1080,
};

/// Screen size in physical pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Resolution {
    /// Width in pixels.
    pub width: u32,
    /// Height in pixels.
    pub height: u32,
}

/// Native resolution of the primary monitor, or 1920×1080 when unknown.
pub fn primary_resolution<R: Runtime>(app: &AppHandle<R>) -> Resolution {
    match app.primary_monitor() {
        Ok(Some(monitor)) => {
            let size = monitor.size();
            Resolution {
                width: size.width,
                height: size.height,
            }
        }
        Ok(None) => FALLBACK_RESOLUTION,
        Err(error) => {
            tracing::warn!(%error, "Could not query the primary monitor");
            FALLBACK_RESOLUTION
        }
    }
}

/// Machine-dependent defaults for settings schemas.
pub fn dynamic_defaults<R: Runtime>(app: &AppHandle<R>) -> DynamicDefaults {
    let resolution = primary_resolution(app);
    DynamicDefaults {
        display_resolution: Some(format!("{}x{}", resolution.width, resolution.height)),
    }
}

/// An audio output choice for `Sound_OutputDriverIndex`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AudioDevice {
    /// Driver index written to `Config.wtf`; `0` is the system default.
    pub index: u32,
    /// Device name.
    pub name: String,
}

/// Audio output devices, starting with the system default at index 0.
pub fn audio_output_devices() -> Vec<AudioDevice> {
    let mut devices = vec![AudioDevice {
        index: 0,
        name: "Default".to_owned(),
    }];
    let outputs = match cpal::default_host().output_devices() {
        Ok(outputs) => outputs,
        Err(error) => {
            tracing::warn!(%error, "Could not enumerate audio output devices");
            return devices;
        }
    };
    for device in outputs {
        match device.description() {
            Ok(description) => devices.push(AudioDevice {
                index: u32::try_from(devices.len()).unwrap_or(u32::MAX),
                name: description.name().to_owned(),
            }),
            Err(error) => tracing::debug!(%error, "Skipping unavailable audio device"),
        }
    }
    devices
}

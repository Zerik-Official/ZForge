//! Log output: what is logged and how each line looks.
//!
//! Lines look like `12:57:42 INFO  session    Game launched pid=18768`.
//! Dependencies only report warnings and errors; ZForge itself logs at
//! `debug` in development builds and `info` in release builds.

use log::LevelFilter;
use tauri::Runtime;
use tauri::plugin::TauriPlugin;
use tauri_plugin_log::{Builder, TimezoneStrategy};

const APP_CRATES: &[&str] = &["zforge", "zforge_lib"];

fn app_level() -> LevelFilter {
    if cfg!(debug_assertions) {
        LevelFilter::Debug
    } else {
        LevelFilter::Info
    }
}

/// Short source label: the last module path segment for ZForge, the crate name otherwise.
fn source(target: &str) -> &str {
    let mut segments = target.split("::");
    let crate_name = segments.next().unwrap_or(target);
    if APP_CRATES.contains(&crate_name) {
        target.rsplit("::").next().unwrap_or(target)
    } else {
        crate_name
    }
}

/// Logging plugin configured for ZForge.
pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    let timezone = TimezoneStrategy::UseLocal;
    let mut builder = Builder::default()
        .level(LevelFilter::Warn)
        .timezone_strategy(timezone.clone())
        .format(move |out, message, record| {
            let now = timezone.get_now();
            out.finish(format_args!(
                "{:02}:{:02}:{:02} {:<5} {:<10} {}",
                now.hour(),
                now.minute(),
                now.second(),
                record.level(),
                source(record.target()),
                message
            ));
        });
    for crate_name in APP_CRATES {
        builder = builder.level_for(*crate_name, app_level());
    }
    builder.build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shortens_sources() {
        assert_eq!(source("zforge_lib::services::session"), "session");
        assert_eq!(source("zforge_lib"), "zforge_lib");
        assert_eq!(source("hyper_util::client::legacy::pool"), "hyper_util");
    }
}

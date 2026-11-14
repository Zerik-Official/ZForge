//! Opening the SDK named pipes.

use std::io::ErrorKind;
use std::time::Duration;

use tokio::net::windows::named_pipe::{ClientOptions, NamedPipeClient};
use tokio::time::{Instant, sleep};

use crate::error::{AppError, AppResult};

/// Pipe that answers one JSON-RPC request per connection.
pub const COMMAND_PIPE: &str = r"\\.\pipe\WowGameCommand";

/// Pipe that streams newline-delimited JSON events to a single client.
pub const EVENT_PIPE: &str = r"\\.\pipe\WowGameEvent";

/// `ERROR_PIPE_BUSY`: every pipe instance is serving another client.
const ERROR_PIPE_BUSY: i32 = 231;

const RETRY_DELAY: Duration = Duration::from_millis(50);

/// Access requested when opening a pipe.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PipeAccess {
    /// Read and write (the command pipe is duplex).
    ReadWrite,
    /// Read only. Required for the event pipe, which the SDK creates as
    /// outbound-only: asking for write access fails with "access denied".
    ReadOnly,
}

/// Open a pipe, retrying while it is busy or not created yet.
///
/// # Errors
///
/// Returns [`AppError::SdkUnavailable`] when the pipe cannot be opened before
/// the timeout, or an I/O error for other failures.
pub async fn open(name: &str, access: PipeAccess, timeout: Duration) -> AppResult<NamedPipeClient> {
    let deadline = Instant::now() + timeout;
    let mut options = ClientOptions::new();
    options.write(access == PipeAccess::ReadWrite);
    loop {
        match options.open(name) {
            Ok(client) => return Ok(client),
            Err(error)
                if error.raw_os_error() == Some(ERROR_PIPE_BUSY)
                    || error.kind() == ErrorKind::NotFound =>
            {
                if Instant::now() >= deadline {
                    return Err(AppError::SdkUnavailable);
                }
                sleep(RETRY_DELAY).await;
            }
            Err(error) => return Err(error.into()),
        }
    }
}

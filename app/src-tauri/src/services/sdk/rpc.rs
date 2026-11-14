//! JSON-RPC 2.0 client for the SDK command pipe.
//!
//! The SDK serves one request per pipe connection: it reads the request,
//! writes the response and disconnects. Requests must fit in 4 KiB. Since
//! SDK 2.0 every request carries the session token in `auth`.

use std::io::ErrorKind;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::time::timeout;

use crate::error::{AppError, AppResult};
use crate::services::sdk::auth::SessionToken;
use crate::services::sdk::pipe::{self, COMMAND_PIPE, PipeAccess};

const MAX_REQUEST_BYTES: usize = 4095;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(35);
const READ_CHUNK: usize = 8192;
const UNAUTHORIZED: i64 = -32001;

#[derive(Debug, Serialize)]
struct Request<'a, P: Serialize> {
    jsonrpc: &'static str,
    id: u64,
    method: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<P>,
    #[serde(skip_serializing_if = "Option::is_none")]
    auth: Option<&'a str>,
}

#[derive(Debug, Deserialize)]
struct RpcErrorBody {
    #[serde(default)]
    code: i64,
    #[serde(default)]
    message: String,
}

#[derive(Debug, Deserialize)]
struct Response<R> {
    result: Option<R>,
    #[serde(default)]
    error: Option<RpcErrorBody>,
}

/// Client for the SDK command pipe.
#[derive(Debug, Default)]
pub struct RpcClient {
    next_id: AtomicU64,
    token: Mutex<Option<SessionToken>>,
}

impl RpcClient {
    /// Use a session token for the following requests, or none for SDK < 2.0.
    ///
    /// # Errors
    ///
    /// Fails when the token lock is poisoned.
    pub fn set_token(&self, token: Option<SessionToken>) -> AppResult<()> {
        *self
            .token
            .lock()
            .map_err(|_| AppError::LockPoisoned("sdk session token"))? = token;
        Ok(())
    }

    /// The current session token.
    ///
    /// # Errors
    ///
    /// Fails when the token lock is poisoned.
    pub fn token(&self) -> AppResult<Option<SessionToken>> {
        Ok(self
            .token
            .lock()
            .map_err(|_| AppError::LockPoisoned("sdk session token"))?
            .clone())
    }

    /// Call a method without parameters.
    ///
    /// # Errors
    ///
    /// See [`RpcClient::call_with`].
    pub async fn call<R: DeserializeOwned>(&self, method: &str) -> AppResult<R> {
        self.call_with::<(), R>(method, None).await
    }

    /// Call a method and decode its `result`.
    ///
    /// # Errors
    ///
    /// Returns [`AppError::SdkUnavailable`] when the pipe is not reachable and
    /// [`AppError::SdkRpc`] when the SDK reports an error or the request is too large.
    pub async fn call_with<P: Serialize, R: DeserializeOwned>(
        &self,
        method: &str,
        params: Option<P>,
    ) -> AppResult<R> {
        let token = self.token()?;
        let request = serde_json::to_vec(&Request {
            jsonrpc: "2.0",
            id: self.next_id.fetch_add(1, Ordering::Relaxed) + 1,
            method,
            params,
            auth: token.as_ref().map(SessionToken::as_str),
        })?;
        if request.len() > MAX_REQUEST_BYTES {
            return Err(AppError::SdkRpc {
                method: method.to_owned(),
                message: format!("request of {} bytes exceeds the pipe buffer", request.len()),
            });
        }

        let mut client = pipe::open(COMMAND_PIPE, PipeAccess::ReadWrite, CONNECT_TIMEOUT).await?;
        client.write_all(&request).await?;
        let raw = timeout(RESPONSE_TIMEOUT, read_message(&mut client))
            .await
            .map_err(|_| AppError::SdkRpc {
                method: method.to_owned(),
                message: "timed out waiting for the response".to_owned(),
            })??;

        let response: Response<R> = serde_json::from_slice(&raw)?;
        if let Some(error) = response.error {
            if error.code == UNAUTHORIZED {
                return Err(AppError::SdkUnauthorized);
            }
            return Err(AppError::SdkRpc {
                method: method.to_owned(),
                message: error.message,
            });
        }
        response.result.ok_or_else(|| AppError::SdkRpc {
            method: method.to_owned(),
            message: "response has no result".to_owned(),
        })
    }
}

/// Read until a complete JSON value arrived or the server disconnected.
async fn read_message(client: &mut (impl AsyncReadExt + Unpin)) -> AppResult<Vec<u8>> {
    let mut message = Vec::new();
    let mut chunk = vec![0_u8; READ_CHUNK];
    loop {
        let read = match client.read(&mut chunk).await {
            Ok(read) => read,
            Err(error) if error.kind() == ErrorKind::BrokenPipe => 0,
            Err(error) => return Err(error.into()),
        };
        if read == 0 {
            return Ok(message);
        }
        message.extend_from_slice(&chunk[..read]);
        if serde_json::from_slice::<serde::de::IgnoredAny>(&message).is_ok() {
            return Ok(message);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_results_and_errors() -> Result<(), serde_json::Error> {
        let ok: Response<u32> = serde_json::from_str(r#"{"id":1,"result":7}"#)?;
        assert_eq!(ok.result, Some(7));
        let failed: Response<u32> =
            serde_json::from_str(r#"{"id":1,"error":{"code":-32601,"message":"no method"}}"#)?;
        assert_eq!(
            failed.error.map(|error| error.message).as_deref(),
            Some("no method")
        );
        Ok(())
    }

    #[test]
    fn serializes_requests_without_empty_params() -> Result<(), serde_json::Error> {
        let request = Request::<()> {
            jsonrpc: "2.0",
            id: 1,
            method: "client.ping",
            params: None,
            auth: None,
        };
        assert_eq!(
            serde_json::to_string(&request)?,
            r#"{"jsonrpc":"2.0","id":1,"method":"client.ping"}"#
        );
        Ok(())
    }

    #[test]
    fn sends_the_token_and_maps_unauthorized() -> Result<(), serde_json::Error> {
        let request = Request::<()> {
            jsonrpc: "2.0",
            id: 2,
            method: "player.getState",
            params: None,
            auth: Some("ab12"),
        };
        assert_eq!(
            serde_json::to_string(&request)?,
            r#"{"jsonrpc":"2.0","id":2,"method":"player.getState","auth":"ab12"}"#
        );
        let denied: Response<u32> =
            serde_json::from_str(r#"{"id":2,"error":{"code":-32001,"message":"Unauthorized"}}"#)?;
        assert_eq!(denied.error.map(|error| error.code), Some(UNAUTHORIZED));
        Ok(())
    }
}

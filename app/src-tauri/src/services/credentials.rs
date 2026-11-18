//! Account passwords kept in the Windows Credential Manager.
//!
//! Passwords never reach SQLite, logs or the frontend: they are written once
//! when an account is saved and read back only to log in.

use std::fmt;
use std::io;
use std::ptr;

use windows_sys::Win32::Foundation::ERROR_NOT_FOUND;
use windows_sys::Win32::Security::Credentials::{
    CRED_MAX_CREDENTIAL_BLOB_SIZE, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC, CREDENTIALW,
    CredDeleteW, CredFree, CredReadW, CredWriteW,
};

use crate::error::{AppError, AppResult};

/// A password that is never printed.
#[derive(Clone, PartialEq, Eq)]
pub struct Password(String);

impl Password {
    /// Wrap a password.
    pub fn new(value: String) -> Self {
        Self(value)
    }

    /// The password text.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Password {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("Password(***)")
    }
}

/// Credential Manager entry of an account.
fn target(account_id: &str) -> Vec<u16> {
    wide(&format!("ZForge/account/{account_id}"))
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

fn last_error() -> AppError {
    AppError::Credential(io::Error::last_os_error().to_string())
}

/// Save the password of an account, replacing the previous one.
///
/// # Errors
///
/// Returns [`AppError::Credential`] when the password is too long or Windows
/// refuses to store it.
#[allow(unsafe_code)]
pub fn save(account_id: &str, username: &str, password: &Password) -> AppResult<()> {
    let mut blob = password.expose().as_bytes().to_vec();
    let blob_size = u32::try_from(blob.len())
        .ok()
        .filter(|size| *size <= CRED_MAX_CREDENTIAL_BLOB_SIZE)
        .ok_or_else(|| AppError::Credential("password is too long".to_owned()))?;
    let mut target_name = target(account_id);
    let mut user_name = wide(username);
    let credential = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: target_name.as_mut_ptr(),
        CredentialBlobSize: blob_size,
        CredentialBlob: blob.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        UserName: user_name.as_mut_ptr(),
        ..CREDENTIALW::default()
    };
    // SAFETY: every pointer in `credential` points to a live, NUL-terminated
    // buffer (or `blob_size` bytes for the blob) that outlives the call.
    let written = unsafe { CredWriteW(&credential, 0) };
    blob.fill(0);
    if written == 0 {
        return Err(last_error());
    }
    Ok(())
}

/// Read the password of an account, or `None` when none is stored.
///
/// # Errors
///
/// Returns [`AppError::Credential`] when Windows cannot read the entry or the
/// stored password is not valid UTF-8.
#[allow(unsafe_code)]
pub fn load(account_id: &str) -> AppResult<Option<Password>> {
    let target_name = target(account_id);
    let mut credential: *mut CREDENTIALW = ptr::null_mut();
    // SAFETY: `target_name` is NUL-terminated and `credential` is a valid out pointer.
    let found = unsafe { CredReadW(target_name.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) };
    if found == 0 {
        let error = io::Error::last_os_error();
        return match error.raw_os_error() {
            Some(code) if u32::try_from(code).ok() == Some(ERROR_NOT_FOUND) => Ok(None),
            _ => Err(AppError::Credential(error.to_string())),
        };
    }
    // SAFETY: on success `credential` points to a structure allocated by
    // Windows whose blob holds `CredentialBlobSize` bytes; it is copied before
    // being released with `CredFree`.
    let bytes = unsafe {
        let entry = &*credential;
        let bytes = if entry.CredentialBlob.is_null() {
            Vec::new()
        } else {
            std::slice::from_raw_parts(entry.CredentialBlob, entry.CredentialBlobSize as usize)
                .to_vec()
        };
        CredFree(credential.cast());
        bytes
    };
    String::from_utf8(bytes)
        .map(|text| Some(Password::new(text)))
        .map_err(|_| AppError::Credential("stored password is not valid UTF-8".to_owned()))
}

/// Delete the password of an account; a no-op when none is stored.
///
/// # Errors
///
/// Returns [`AppError::Credential`] when Windows refuses to delete it.
#[allow(unsafe_code)]
pub fn delete(account_id: &str) -> AppResult<()> {
    let target_name = target(account_id);
    // SAFETY: `target_name` is a NUL-terminated UTF-16 buffer that outlives the call.
    let deleted = unsafe { CredDeleteW(target_name.as_ptr(), CRED_TYPE_GENERIC, 0) };
    if deleted == 0 {
        let error = io::Error::last_os_error();
        if error
            .raw_os_error()
            .and_then(|code| u32::try_from(code).ok())
            != Some(ERROR_NOT_FOUND)
        {
            return Err(AppError::Credential(error.to_string()));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hides_passwords_in_debug_output() {
        let password = Password::new("hunter2".to_owned());
        assert_eq!(format!("{password:?}"), "Password(***)");
        assert_eq!(password.expose(), "hunter2");
    }

    #[test]
    fn stores_reads_and_deletes_passwords() -> AppResult<()> {
        let id = format!("test-{}", uuid::Uuid::new_v4());
        assert_eq!(load(&id)?, None);
        save(&id, "player", &Password::new("first".to_owned()))?;
        save(&id, "player", &Password::new("contraseña".to_owned()))?;
        assert_eq!(
            load(&id)?.as_ref().map(Password::expose),
            Some("contraseña")
        );
        delete(&id)?;
        delete(&id)?;
        assert_eq!(load(&id)?, None);
        Ok(())
    }
}

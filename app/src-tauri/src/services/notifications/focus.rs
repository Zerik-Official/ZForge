//! Whether the game window is the one the user is looking at.

use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

/// Whether the foreground window belongs to this process.
#[allow(unsafe_code)]
pub fn is_process_foreground(pid: u32) -> bool {
    // SAFETY: `GetForegroundWindow` takes no arguments and returns a window handle or null.
    let window = unsafe { GetForegroundWindow() };
    if window.is_null() {
        return false;
    }
    let mut owner: u32 = 0;
    // SAFETY: `window` is a handle returned by Windows and `owner` is a valid `u32` to write to.
    unsafe { GetWindowThreadProcessId(window, &mut owner) };
    owner == pid
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_processes_are_never_in_the_foreground() {
        assert!(!is_process_foreground(0));
    }
}

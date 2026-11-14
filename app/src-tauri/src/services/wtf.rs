//! Reading and editing World of Warcraft `.wtf` files.
//!
//! Files are handled line by line as raw bytes: lines the launcher does not
//! touch are written back byte for byte, whatever their encoding, and every
//! line keeps its original line ending.

use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use crate::error::AppResult;

const CRLF: &[u8] = b"\r\n";
const LF: &[u8] = b"\n";

/// A `.wtf` file split into lines that keep their own line endings.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct WtfLines {
    lines: Vec<Vec<u8>>,
    newline: &'static [u8],
}

impl WtfLines {
    fn parse(bytes: &[u8]) -> Self {
        let newline = if bytes.windows(2).any(|pair| pair == CRLF) {
            CRLF
        } else {
            LF
        };
        Self {
            lines: bytes
                .split_inclusive(|byte| *byte == b'\n')
                .map(<[u8]>::to_vec)
                .collect(),
            newline,
        }
    }

    fn read(path: &Path) -> AppResult<Self> {
        match fs::read(path) {
            Ok(bytes) => Ok(Self::parse(&bytes)),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(Self {
                lines: Vec::new(),
                newline: CRLF,
            }),
            Err(error) => Err(error.into()),
        }
    }

    fn push(&mut self, content: String) {
        if let Some(last) = self.lines.last_mut()
            && line_ending(last).is_none()
        {
            last.extend_from_slice(self.newline);
        }
        let mut line = content.into_bytes();
        line.extend_from_slice(self.newline);
        self.lines.push(line);
    }

    fn to_bytes(&self) -> Vec<u8> {
        self.lines.concat()
    }

    fn write(&self, path: &Path) -> AppResult<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let temporary = path.with_extension("wtf.tmp");
        fs::write(&temporary, self.to_bytes())?;
        fs::rename(&temporary, path)?;
        Ok(())
    }
}

fn line_ending(line: &[u8]) -> Option<&'static [u8]> {
    if line.ends_with(CRLF) {
        Some(CRLF)
    } else if line.ends_with(LF) {
        Some(LF)
    } else {
        None
    }
}

/// Build a replacement line that keeps the original line's ending.
fn replace_line(default_newline: &'static [u8], original: &[u8], content: String) -> Vec<u8> {
    let mut line = content.into_bytes();
    line.extend_from_slice(line_ending(original).unwrap_or(default_newline));
    line
}

/// Split a trimmed line into its first word and the remainder.
fn split_word(line: &[u8]) -> (&[u8], &[u8]) {
    let end = line
        .iter()
        .position(u8::is_ascii_whitespace)
        .unwrap_or(line.len());
    let (word, rest) = line.split_at(end);
    (word, rest.trim_ascii_start())
}

/// Parse a `SET key "value"` line into its key and unquoted value.
fn parse_set_line(line: &[u8]) -> Option<(String, String)> {
    let (command, rest) = split_word(line.trim_ascii());
    if !command.eq_ignore_ascii_case(b"SET") {
        return None;
    }
    let (key, value) = split_word(rest);
    if key.is_empty() {
        return None;
    }
    let value = value.trim_ascii();
    let value = value
        .strip_prefix(b"\"")
        .and_then(|inner| inner.strip_suffix(b"\""))
        .unwrap_or(value);
    Some((
        String::from_utf8_lossy(key).into_owned(),
        String::from_utf8_lossy(value).into_owned(),
    ))
}

/// The parsed contents of a `Config.wtf` file.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ConfigWtf {
    file: WtfLines,
}

impl ConfigWtf {
    /// Parse `Config.wtf` contents.
    pub fn parse(bytes: &[u8]) -> Self {
        Self {
            file: WtfLines::parse(bytes),
        }
    }

    /// Read a `Config.wtf` file; a missing file is treated as empty.
    ///
    /// # Errors
    ///
    /// Fails when the file exists but cannot be read.
    pub fn read(path: &Path) -> AppResult<Self> {
        Ok(Self {
            file: WtfLines::read(path)?,
        })
    }

    /// Value of a CVar (case-insensitive); the last assignment wins, as in the game.
    pub fn get(&self, key: &str) -> Option<String> {
        self.file
            .lines
            .iter()
            .rev()
            .filter_map(|line| parse_set_line(line))
            .find(|(stored, _)| stored.eq_ignore_ascii_case(key))
            .map(|(_, value)| value)
    }

    /// Set a CVar, or remove it with `None`.
    ///
    /// The first assignment is rewritten in place and later duplicates are
    /// dropped; a new key is appended at the end.
    pub fn set(&mut self, key: &str, value: Option<&str>) {
        let mut replaced = false;
        let mut lines = Vec::with_capacity(self.file.lines.len() + 1);
        for line in std::mem::take(&mut self.file.lines) {
            let Some((stored, _)) = parse_set_line(&line) else {
                lines.push(line);
                continue;
            };
            if !stored.eq_ignore_ascii_case(key) {
                lines.push(line);
                continue;
            }
            if !replaced && let Some(value) = value {
                lines.push(replace_line(
                    self.file.newline,
                    &line,
                    format!("SET {stored} \"{value}\""),
                ));
            }
            replaced = true;
        }
        self.file.lines = lines;
        if !replaced && let Some(value) = value {
            self.file.push(format!("SET {key} \"{value}\""));
        }
    }

    /// Serialized file contents.
    pub fn to_bytes(&self) -> Vec<u8> {
        self.file.to_bytes()
    }

    /// Atomically write the file, creating its directory when needed.
    ///
    /// # Errors
    ///
    /// Fails when the directory cannot be created or the file cannot be written.
    pub fn write(&self, path: &Path) -> AppResult<()> {
        self.file.write(path)
    }
}

fn is_active_realmlist_line(line: &[u8]) -> bool {
    let (command, rest) = split_word(line.trim_ascii());
    let (key, _) = split_word(rest);
    command.eq_ignore_ascii_case(b"set") && key.eq_ignore_ascii_case(b"realmlist")
}

/// Replace the active `set realmlist` line of a `realmlist.wtf` file, or
/// create it. Disabled lines (starting with `-`) are kept as backups.
///
/// # Errors
///
/// Fails when the file cannot be read or written.
pub fn set_realmlist(path: &Path, realmlist: &str) -> AppResult<()> {
    let mut file = WtfLines::read(path)?;
    let content = format!("set realmlist {realmlist}");
    let mut replaced = false;
    for line in &mut file.lines {
        if is_active_realmlist_line(line) {
            *line = replace_line(file.newline, line, content.clone());
            replaced = true;
        }
    }
    if !replaced {
        file.push(content);
    }
    file.write(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_values_case_insensitively() {
        let config = ConfigWtf::parse(b"SET gxWindow \"1\"\r\nset REALMLIST logon.example\r\n");
        assert_eq!(config.get("gxwindow").as_deref(), Some("1"));
        assert_eq!(config.get("realmList").as_deref(), Some("logon.example"));
        assert_eq!(config.get("missing"), None);
    }

    #[test]
    fn edits_in_place_and_keeps_other_lines_untouched() {
        let original: &[u8] =
            b"SET accountName \"Jos\xe9\"\r\nSET gxWindow \"1\"\r\nSET gxVSync \"0\"\r\nSET gxWindow \"0\"\r\n";
        let mut config = ConfigWtf::parse(original);
        config.set("GXWINDOW", Some("1"));
        config.set("gxVSync", None);
        config.set("farclip", Some("1277"));
        assert_eq!(
            config.to_bytes(),
            b"SET accountName \"Jos\xe9\"\r\nSET gxWindow \"1\"\r\nSET farclip \"1277\"\r\n"
        );
    }

    #[test]
    fn appends_after_a_last_line_without_newline() {
        let mut config = ConfigWtf::parse(b"SET a \"1\"");
        config.set("b", Some("2"));
        assert_eq!(config.to_bytes(), b"SET a \"1\"\nSET b \"2\"\n");
    }

    #[test]
    fn updates_realmlist_and_keeps_disabled_backups() -> AppResult<()> {
        let directory = tempfile::tempdir()?;
        let path = directory.path().join("enUS").join("realmlist.wtf");
        set_realmlist(&path, "logon.new")?;
        assert_eq!(fs::read(&path)?, b"set realmlist logon.new\r\n");

        fs::write(
            &path,
            b"-set realmlist logon.backup\nset realmlist logon.old\n",
        )?;
        set_realmlist(&path, "logon.new")?;
        assert_eq!(
            fs::read(&path)?,
            b"-set realmlist logon.backup\nset realmlist logon.new\n"
        );
        Ok(())
    }
}

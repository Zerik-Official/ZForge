//! Build script that generates the Tauri context, Windows resources, the
//! bundled asset catalogue and the commit the launcher is built from.
//!
//! Files under `public/assets/games` are embedded in the frontend bundle, so the
//! backend cannot list them at runtime; their public URLs are collected here and
//! written to `$OUT_DIR/bundled_assets.rs`.

use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const ASSETS_ROOT: &str = "../public/assets/games";
const ASSETS_URL_PREFIX: &str = "/assets/games";

fn collect_files(directory: &Path, files: &mut Vec<PathBuf>) -> Result<(), Box<dyn Error>> {
    if !directory.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(directory)? {
        let path = entry?.path();
        if path.is_dir() {
            collect_files(&path, files)?;
        } else {
            files.push(path);
        }
    }
    Ok(())
}

fn write_asset_catalogue() -> Result<(), Box<dyn Error>> {
    println!("cargo:rerun-if-changed={ASSETS_ROOT}");
    let root = Path::new(ASSETS_ROOT);
    let mut files = Vec::new();
    collect_files(root, &mut files)?;

    let mut urls: Vec<String> = files
        .iter()
        .filter_map(|path| path.strip_prefix(root).ok())
        .map(|relative| {
            let segments: Vec<String> = relative
                .components()
                .map(|component| component.as_os_str().to_string_lossy().into_owned())
                .collect();
            format!("{ASSETS_URL_PREFIX}/{}", segments.join("/"))
        })
        .collect();
    urls.sort();

    let entries: String = urls.iter().map(|url| format!("    {url:?},\n")).collect();
    let source = format!(
        "/// Public URLs of every bundled game asset, sorted.\n\
         pub const BUNDLED_ASSET_URLS: &[&str] = &[\n{entries}];\n"
    );
    let out_dir = PathBuf::from(std::env::var("OUT_DIR")?);
    fs::write(out_dir.join("bundled_assets.rs"), source)?;
    Ok(())
}

/// Expose `DISCORD_CLIENT_ID` from `app/.env` as `ZFORGE_DISCORD_CLIENT_ID`
/// unless that variable is already set in the environment.
fn forward_discord_client_id() -> Result<(), Box<dyn Error>> {
    const ENV_FILE: &str = "../.env";
    const TARGET: &str = "ZFORGE_DISCORD_CLIENT_ID";
    println!("cargo:rerun-if-changed={ENV_FILE}");
    println!("cargo:rerun-if-env-changed={TARGET}");
    if std::env::var_os(TARGET).is_some() {
        return Ok(());
    }
    let contents = match fs::read_to_string(ENV_FILE) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.into()),
    };
    let client_id = contents
        .lines()
        .filter_map(|line| line.trim().strip_prefix("DISCORD_CLIENT_ID="))
        .map(|value| value.trim().trim_matches('"'))
        .find(|value| !value.is_empty() && value.chars().all(|c| c.is_ascii_digit()));
    if let Some(client_id) = client_id {
        println!("cargo:rustc-env={TARGET}={client_id}");
    }
    Ok(())
}

/// Output of a git command run at the repository root, or `None` when git is not
/// available or the command fails.
fn git(args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir("../..")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

/// Expose the commit the launcher is built from as `ZFORGE_COMMIT`, its ISO 8601
/// date as `ZFORGE_COMMIT_DATE` and `ZFORGE_COMMIT_DIRTY=1` when tracked files have
/// uncommitted changes. Nothing is set when git is not available.
fn forward_build_commit() {
    println!("cargo:rerun-if-changed=../../.git/HEAD");
    println!("cargo:rerun-if-changed=../../.git/refs/heads");
    println!("cargo:rerun-if-changed=../../.git/index");
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");

    let commit = std::env::var("GITHUB_SHA")
        .ok()
        .filter(|sha| !sha.is_empty())
        .or_else(|| git(&["rev-parse", "HEAD"]));
    let Some(commit) = commit else {
        return;
    };
    println!("cargo:rustc-env=ZFORGE_COMMIT={commit}");
    if let Some(date) = git(&["log", "-1", "--format=%cI", &commit]) {
        println!("cargo:rustc-env=ZFORGE_COMMIT_DATE={date}");
    }
    let dirty = git(&["status", "--porcelain", "--untracked-files=no"])
        .is_some_and(|status| !status.is_empty());
    if dirty {
        println!("cargo:rustc-env=ZFORGE_COMMIT_DIRTY=1");
    }
}

fn main() -> Result<(), Box<dyn Error>> {
    write_asset_catalogue()?;
    forward_discord_client_id()?;
    forward_build_commit();
    tauri_build::build();
    Ok(())
}

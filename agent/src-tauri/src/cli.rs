use std::path::{Path as FsPath, PathBuf};
use std::sync::OnceLock;

pub static CODEX_VERSION_CACHE: OnceLock<Option<String>> = OnceLock::new();
pub static GEMINI_VERSION_CACHE: OnceLock<Option<String>> = OnceLock::new();
pub static CLIPROXYAPI_VERSION_CACHE: OnceLock<Option<String>> = OnceLock::new();

fn detect_cli_version(command: &str) -> Option<String> {
  let output = std::process::Command::new(command)
    .arg("--version")
    .output()
    .ok()?;
  let raw = if output.stdout.is_empty() {
    String::from_utf8_lossy(&output.stderr).to_string()
  } else {
    String::from_utf8_lossy(&output.stdout).to_string()
  };
  let first_line = raw.lines().next().unwrap_or("").trim().to_string();
  if first_line.is_empty() {
    None
  } else {
    Some(first_line)
  }
}

pub fn cached_cli_version(cache: &'static OnceLock<Option<String>>, command: &str) -> Option<String> {
  cache.get_or_init(|| detect_cli_version(command)).clone()
}

fn which_command(command: &str) -> bool {
  if FsPath::new(command).is_absolute() {
    return FsPath::new(command).exists();
  }
  std::env::var_os("PATH")
    .unwrap_or_default()
    .to_string_lossy()
    .split(':')
    .any(|segment| FsPath::new(segment).join(command).exists())
}

pub fn resolve_command_path(command: &str) -> Option<PathBuf> {
  if FsPath::new(command).is_absolute() {
    return FsPath::new(command).exists().then(|| PathBuf::from(command));
  }
  for segment in std::env::var_os("PATH").unwrap_or_default().to_string_lossy().split(':') {
    if segment.trim().is_empty() {
      continue;
    }
    let candidate = FsPath::new(segment).join(command);
    if candidate.exists() {
      return Some(candidate);
    }
  }
  None
}

pub fn resolve_node_path() -> Option<PathBuf> {
  resolve_command_path("node")
    .or_else(|| resolve_command_path("nodejs"))
    .or_else(|| {
      let candidates = [
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/usr/bin/node",
      ];
      candidates
        .into_iter()
        .find(|p| FsPath::new(p).exists())
        .map(PathBuf::from)
    })
}

pub fn which_codex(command: &str) -> bool {
  which_command(command)
}

pub fn which_gemini(command: &str) -> bool {
  which_command(command)
}

pub fn which_cliproxyapi(command: &str) -> bool {
  which_command(command)
}


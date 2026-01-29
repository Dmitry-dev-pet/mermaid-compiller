use crate::{cli, CodexAppServer, Config};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path as FsPath, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use time::OffsetDateTime;
use tokio::process::Command;
use tokio::sync::Mutex;

#[derive(Clone, Debug)]
struct SnapshotCache<T> {
  updated_at: u64,
  line: String,
  snapshot: T,
  in_flight: bool,
}

static CODEX_RATE_LIMITS_CACHE: OnceLock<Mutex<SnapshotCache<CodexRateLimitsSnapshot>>> = OnceLock::new();
static GEMINI_QUOTA_CACHE: OnceLock<Mutex<SnapshotCache<GeminiQuotaSnapshot>>> = OnceLock::new();

#[derive(Clone, Debug, Serialize)]
pub struct GeminiQuotaItem {
  pub id: String,
  pub label: String,
  pub remaining_percent: Option<i64>,
  pub reset_label: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct GeminiQuotaSnapshot {
  pub status: String,
  pub updated_at: u64,
  pub message: Option<String>,
  pub email: Option<String>,
  pub project_id: Option<String>,
  pub items: Vec<GeminiQuotaItem>,
}

#[derive(Clone, Debug, Serialize)]
pub struct CodexRateLimitWindow {
  pub id: String,
  pub label: String,
  pub used_percent: Option<i64>,
  pub remaining_percent: Option<i64>,
  pub reset_label: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct CodexRateLimitsSnapshot {
  pub status: String,
  pub updated_at: u64,
  pub message: Option<String>,
  pub plan_type: Option<String>,
  pub credits_balance: Option<String>,
  pub has_credits: Option<bool>,
  pub unlimited: Option<bool>,
  pub windows: Vec<CodexRateLimitWindow>,
}

fn default_codex_snapshot() -> CodexRateLimitsSnapshot {
  CodexRateLimitsSnapshot {
    status: "idle".to_string(),
    updated_at: 0,
    message: None,
    plan_type: None,
    credits_balance: None,
    has_credits: None,
    unlimited: None,
    windows: Vec::new(),
  }
}

fn default_gemini_snapshot() -> GeminiQuotaSnapshot {
  GeminiQuotaSnapshot {
    status: "idle".to_string(),
    updated_at: 0,
    message: None,
    email: None,
    project_id: None,
    items: Vec::new(),
  }
}

fn format_unix_reset_label(seconds: u64) -> Option<String> {
  let ts = i64::try_from(seconds).ok()?;
  let dt = OffsetDateTime::from_unix_timestamp(ts).ok()?;
  let month = dt.month() as u8;
  let day = dt.day();
  let hh = dt.hour();
  let mm = dt.minute();
  Some(format!("{month:02}.{day:02}, {hh:02}:{mm:02}"))
}

fn parse_gemini_reset_label(value: &str) -> Option<String> {
  let trimmed = value.trim();
  if trimmed.is_empty() {
    return None;
  }
  if trimmed.len() >= 16 {
    let bytes = trimmed.as_bytes();
    if bytes.get(4) == Some(&b'-') && bytes.get(7) == Some(&b'-') && bytes.get(10) == Some(&b'T') {
      let month = &trimmed[5..7];
      let day = &trimmed[8..10];
      let hh = &trimmed[11..13];
      let mm = &trimmed[14..16];
      return Some(format!("{month}.{day}, {hh}:{mm}"));
    }
  }
  Some(trimmed.to_string())
}

fn resolve_gemini_cli_core_entry(gemini_cmd: &str) -> Option<PathBuf> {
  let gemini_path = cli::resolve_command_path(gemini_cmd)
    .or_else(|| FsPath::new(gemini_cmd).exists().then(|| PathBuf::from(gemini_cmd)))?;
  let gemini_real = std::fs::canonicalize(gemini_path).ok()?;
  let cli_root = gemini_real.parent()?.parent()?;
  let core_entry = cli_root.join("node_modules/@google/gemini-cli-core/dist/index.js");
  core_entry.exists().then_some(core_entry)
}

fn parse_gemini_quota_snapshot_from_json(json: Value) -> GeminiQuotaSnapshot {
  let ok = json.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
  if !ok {
    let err = json.get("error").and_then(|v| v.as_str()).unwrap_or("unavailable").trim();
    return GeminiQuotaSnapshot {
      status: "error".to_string(),
      updated_at: crate::now_unix(),
      message: Some(err.to_string()),
      email: None,
      project_id: None,
      items: Vec::new(),
    };
  }

  let email = json.get("email").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
  let project_id = json.get("projectId").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
  let buckets = json
    .get("quota")
    .and_then(|q| q.get("buckets"))
    .and_then(|b| b.as_array())
    .cloned()
    .unwrap_or_default();

  let mut flash_remaining: Option<f64> = None;
  let mut flash_reset: Option<String> = None;
  let mut pro_remaining: Option<f64> = None;
  let mut pro_reset: Option<String> = None;

  let flash_models = ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
  let pro_models = ["gemini-3-pro-preview", "gemini-2.5-pro"];

  let consider_bucket = |model_ids: &[&str], remaining: &mut Option<f64>, reset: &mut Option<String>, prefer: &str| {
    let mut preferred: Option<(f64, Option<String>)> = None;
    let mut min_other: Option<(f64, Option<String>)> = None;
    for b in buckets.iter() {
      let model_id = b.get("modelId").and_then(|v| v.as_str()).unwrap_or("").trim();
      if model_id.is_empty() {
        continue;
      }
      if model_id.starts_with("gemini-2.0-flash") {
        continue;
      }
      if !model_ids.iter().any(|m| model_id.eq_ignore_ascii_case(m)) {
        continue;
      }
      let frac = b.get("remainingFraction").and_then(|v| v.as_f64());
      let Some(frac) = frac else { continue; };
      let frac = frac.max(0.0).min(1.0);
      let reset_time = b.get("resetTime").and_then(|v| v.as_str()).and_then(parse_gemini_reset_label);
      if model_id.eq_ignore_ascii_case(prefer) {
        preferred = Some((frac, reset_time));
      } else {
        match min_other {
          None => min_other = Some((frac, reset_time)),
          Some((prev, prev_reset)) => {
            if frac < prev {
              min_other = Some((frac, reset_time));
            } else {
              min_other = Some((prev, prev_reset));
            }
          }
        }
      }
    }
    let chosen = preferred.or(min_other);
    if let Some((frac, reset_time)) = chosen {
      *remaining = Some(frac);
      *reset = reset_time;
    }
  };

  consider_bucket(&flash_models, &mut flash_remaining, &mut flash_reset, "gemini-3-flash-preview");
  consider_bucket(&pro_models, &mut pro_remaining, &mut pro_reset, "gemini-3-pro-preview");

  let to_percent = |frac: Option<f64>| frac.map(|v| (v * 100.0).round() as i64);
  let items = vec![
    GeminiQuotaItem {
      id: "gemini-flash-series".to_string(),
      label: "Gemini Flash Series".to_string(),
      remaining_percent: to_percent(flash_remaining),
      reset_label: flash_reset.unwrap_or_else(|| "-".to_string()),
    },
    GeminiQuotaItem {
      id: "gemini-pro-series".to_string(),
      label: "Gemini Pro Series".to_string(),
      remaining_percent: to_percent(pro_remaining),
      reset_label: pro_reset.unwrap_or_else(|| "-".to_string()),
    },
  ];

  GeminiQuotaSnapshot {
    status: "ok".to_string(),
    updated_at: crate::now_unix(),
    message: None,
    email,
    project_id,
    items,
  }
}

fn format_gemini_quota_line(snapshot: &GeminiQuotaSnapshot) -> String {
  if snapshot.status != "ok" {
    let msg = snapshot.message.clone().unwrap_or_else(|| "unavailable".to_string());
    return format!("Gemini quota: {msg}");
  }
  let email_label = snapshot.email.as_ref().map(|e| format!(" ({e})")).unwrap_or_default();
  let mut flash = snapshot.items.iter().find(|it| it.id == "gemini-flash-series");
  let mut pro = snapshot.items.iter().find(|it| it.id == "gemini-pro-series");
  let fmt = |item: Option<&GeminiQuotaItem>| -> (String, String) {
    let Some(item) = item else { return ("-".to_string(), "-".to_string()); };
    let p = item.remaining_percent.map(|v| format!("{v}%")).unwrap_or_else(|| "-".to_string());
    let r = item.reset_label.clone();
    (p, r)
  };
  let (flash_p, flash_r) = fmt(flash.take());
  let (pro_p, pro_r) = fmt(pro.take());
  format!("Gemini quota{email_label}: Flash {flash_p} · {flash_r} | Pro {pro_p} · {pro_r}")
}

fn format_codex_rate_limits_line(snapshot: &CodexRateLimitsSnapshot) -> String {
  if snapshot.status != "ok" {
    let msg = snapshot.message.clone().unwrap_or_else(|| "unavailable".to_string());
    return format!("Codex quota: {msg}");
  }
  let mut primary = "-".to_string();
  let mut secondary = "-".to_string();
  for w in snapshot.windows.iter() {
    let p = w.remaining_percent.map(|v| format!("{v}%")).unwrap_or_else(|| "-".to_string());
    let r = w.reset_label.clone();
    if w.id == "primary" {
      primary = format!("{p} · {r}");
    } else if w.id == "secondary" {
      secondary = format!("{p} · {r}");
    }
  }
  format!("Codex quota: 5h {primary} | wk {secondary}")
}

pub async fn get_cached_codex_rate_limits_line(codex: Option<Arc<CodexAppServer>>) -> String {
  let cache = CODEX_RATE_LIMITS_CACHE.get_or_init(|| Mutex::new(SnapshotCache {
    updated_at: 0,
    line: "Codex quota: —".to_string(),
    snapshot: default_codex_snapshot(),
    in_flight: false,
  }));

  let now = crate::now_unix();
  {
    let mut state = cache.lock().await;
    if now.saturating_sub(state.updated_at) < 60 {
      return state.line.clone();
    }
    if state.in_flight {
      return state.line.clone();
    }
    state.in_flight = true;
  }

  let cache_ptr: &'static Mutex<SnapshotCache<CodexRateLimitsSnapshot>> = cache;
  tauri::async_runtime::spawn(async move {
    let (snapshot, line) = fetch_codex_rate_limits_snapshot_and_line(codex).await;
    let mut state = cache_ptr.lock().await;
    state.updated_at = snapshot.updated_at;
    state.line = line;
    state.snapshot = snapshot;
    state.in_flight = false;
  });

  cache.lock().await.line.clone()
}

pub async fn get_cached_codex_rate_limits_snapshot(codex: Option<Arc<CodexAppServer>>) -> CodexRateLimitsSnapshot {
  let cache = CODEX_RATE_LIMITS_CACHE.get_or_init(|| Mutex::new(SnapshotCache {
    updated_at: 0,
    line: "Codex quota: —".to_string(),
    snapshot: default_codex_snapshot(),
    in_flight: false,
  }));

  let now = crate::now_unix();
  {
    let mut state = cache.lock().await;
    if now.saturating_sub(state.updated_at) < 60 {
      return state.snapshot.clone();
    }
    if state.in_flight {
      return state.snapshot.clone();
    }
    state.in_flight = true;
  }

  let cache_ptr: &'static Mutex<SnapshotCache<CodexRateLimitsSnapshot>> = cache;
  tauri::async_runtime::spawn(async move {
    let (snapshot, line) = fetch_codex_rate_limits_snapshot_and_line(codex).await;
    let mut state = cache_ptr.lock().await;
    state.updated_at = snapshot.updated_at;
    state.line = line;
    state.snapshot = snapshot;
    state.in_flight = false;
  });

  cache.lock().await.snapshot.clone()
}

async fn fetch_codex_rate_limits_snapshot_and_line(codex: Option<Arc<CodexAppServer>>) -> (CodexRateLimitsSnapshot, String) {
  let Some(codex) = codex else {
    let snapshot = CodexRateLimitsSnapshot {
      status: "error".to_string(),
      updated_at: crate::now_unix(),
      message: Some("codex unavailable".to_string()),
      ..default_codex_snapshot()
    };
    return (snapshot.clone(), format_codex_rate_limits_line(&snapshot));
  };

  match codex.read_rate_limits().await {
    Ok(value) => {
      let plan_type = value.get("planType").and_then(|v| v.as_str()).map(|s| s.to_string());
      let credits_balance = value.get("credits").and_then(|c| c.get("balance")).and_then(|v| v.as_str()).map(|s| s.to_string());
      let has_credits = value.get("credits").and_then(|c| c.get("hasCredits")).and_then(|v| v.as_bool());
      let unlimited = value.get("credits").and_then(|c| c.get("unlimited")).and_then(|v| v.as_bool());
      let mut windows = Vec::new();
      if let Some(obj) = value.get("rateLimits").and_then(|v| v.as_object()) {
        for (id, w) in obj.iter() {
          let label = w.get("name").and_then(|v| v.as_str()).unwrap_or(id).to_string();
          let used_percent = w.get("usedPercent").and_then(|v| v.as_i64());
          let remaining_percent = used_percent.map(|u| 100 - u).map(|v| v.max(0).min(100));
          let reset_label = w.get("resetsAt").and_then(|v| v.as_u64()).and_then(format_unix_reset_label).unwrap_or_else(|| "-".to_string());
          windows.push(CodexRateLimitWindow {
            id: id.to_string(),
            label,
            used_percent,
            remaining_percent,
            reset_label,
          });
        }
      }
      windows.sort_by(|a, b| a.id.cmp(&b.id));
      let snapshot = CodexRateLimitsSnapshot {
        status: "ok".to_string(),
        updated_at: crate::now_unix(),
        message: None,
        plan_type,
        credits_balance,
        has_credits,
        unlimited,
        windows,
      };
      let line = format_codex_rate_limits_line(&snapshot);
      (snapshot, line)
    }
    Err(err) => {
      let snapshot = CodexRateLimitsSnapshot {
        status: "error".to_string(),
        updated_at: crate::now_unix(),
        message: Some(err),
        ..default_codex_snapshot()
      };
      (snapshot.clone(), format_codex_rate_limits_line(&snapshot))
    }
  }
}

pub async fn get_cached_gemini_quota_line(config: Arc<Config>) -> String {
  let cache = GEMINI_QUOTA_CACHE.get_or_init(|| Mutex::new(SnapshotCache {
    updated_at: 0,
    line: "Gemini quota: —".to_string(),
    snapshot: default_gemini_snapshot(),
    in_flight: false,
  }));

  let now = crate::now_unix();
  {
    let mut state = cache.lock().await;
    if now.saturating_sub(state.updated_at) < 60 {
      return state.line.clone();
    }
    if state.in_flight {
      return state.line.clone();
    }
    state.in_flight = true;
  }

  let cache_ptr: &'static Mutex<SnapshotCache<GeminiQuotaSnapshot>> = cache;
  tauri::async_runtime::spawn(async move {
    let (snapshot, line) = fetch_gemini_quota_snapshot_and_line(config).await;
    let mut state = cache_ptr.lock().await;
    state.updated_at = snapshot.updated_at;
    state.line = line;
    state.snapshot = snapshot;
    state.in_flight = false;
  });

  cache.lock().await.line.clone()
}

pub async fn get_cached_gemini_quota_snapshot(config: Arc<Config>) -> GeminiQuotaSnapshot {
  let cache = GEMINI_QUOTA_CACHE.get_or_init(|| Mutex::new(SnapshotCache {
    updated_at: 0,
    line: "Gemini quota: —".to_string(),
    snapshot: default_gemini_snapshot(),
    in_flight: false,
  }));

  let now = crate::now_unix();
  {
    let mut state = cache.lock().await;
    if now.saturating_sub(state.updated_at) < 60 {
      return state.snapshot.clone();
    }
    if state.in_flight {
      return state.snapshot.clone();
    }
    state.in_flight = true;
  }

  let cache_ptr: &'static Mutex<SnapshotCache<GeminiQuotaSnapshot>> = cache;
  tauri::async_runtime::spawn(async move {
    let (snapshot, line) = fetch_gemini_quota_snapshot_and_line(config).await;
    let mut state = cache_ptr.lock().await;
    state.updated_at = snapshot.updated_at;
    state.line = line;
    state.snapshot = snapshot;
    state.in_flight = false;
  });

  cache.lock().await.snapshot.clone()
}

async fn fetch_gemini_quota_snapshot_and_line(config: Arc<Config>) -> (GeminiQuotaSnapshot, String) {
  if !cli::which_gemini(&config.gemini_cmd) {
    let snapshot = GeminiQuotaSnapshot {
      status: "error".to_string(),
      updated_at: crate::now_unix(),
      message: Some("gemini missing".to_string()),
      ..default_gemini_snapshot()
    };
    return (snapshot.clone(), format_gemini_quota_line(&snapshot));
  }

  let node = match cli::resolve_node_path() {
    Some(path) => path,
    None => {
      let snapshot = GeminiQuotaSnapshot {
        status: "error".to_string(),
        updated_at: crate::now_unix(),
        message: Some("node missing".to_string()),
        ..default_gemini_snapshot()
      };
      return (snapshot.clone(), format_gemini_quota_line(&snapshot));
    }
  };

  let core_entry = match resolve_gemini_cli_core_entry(&config.gemini_cmd) {
    Some(path) => path,
    None => {
      let snapshot = GeminiQuotaSnapshot {
        status: "error".to_string(),
        updated_at: crate::now_unix(),
        message: Some("core missing".to_string()),
        ..default_gemini_snapshot()
      };
      return (snapshot.clone(), format_gemini_quota_line(&snapshot));
    }
  };

  let script = r#"
    const fs = require('fs');
    const core = require(process.env.CORE_PATH);
    const credsPath = core.Storage.getOAuthCredsPath();
    if (!fs.existsSync(credsPath)) {
      console.log(JSON.stringify({ ok: false, error: 'missing oauth creds', credsPath }));
      process.exit(0);
    }
    const cfg = core.makeFakeConfig({ targetDir: process.cwd(), cwd: process.cwd(), debugMode: false, usageStatisticsEnabled: true, model: 'gemini-2.5-pro' });
    (async () => {
      const client = await core.getOauthClient(core.AuthType.LOGIN_WITH_GOOGLE, cfg);
      const envProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID || null;
      const server = new core.CodeAssistServer(client, envProject || undefined, {}, '', undefined, undefined);
      const metadata = { ideType: 'GEMINI_CLI', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' };
      const load = await server.loadCodeAssist({
        cloudaicompanionProject: envProject || undefined,
        metadata: { ...metadata, duetProject: envProject || undefined },
      });
      const projectId = (load && load.cloudaicompanionProject) ? load.cloudaicompanionProject : envProject;
      if (!projectId) {
        console.log(JSON.stringify({ ok: false, error: 'project id unavailable', load }));
        return;
      }
      const quota = await server.retrieveUserQuota({ project: projectId });
      const email = new core.UserAccountManager().getCachedGoogleAccount() || null;
      console.log(JSON.stringify({ ok: true, email, projectId, quota }));
    })().catch((err) => {
      const message = (err && (err.message || err.toString())) ? (err.message || err.toString()) : 'unknown error';
      console.log(JSON.stringify({ ok: false, error: message }));
    });
  "#;

  let mut cmd = Command::new(node);
  cmd.arg("-e")
    .arg(script)
    .env("CORE_PATH", core_entry)
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

  let output = match tokio::time::timeout(Duration::from_secs(5), cmd.output()).await {
    Ok(result) => match result {
      Ok(output) => output,
      Err(err) => {
        let snapshot = GeminiQuotaSnapshot {
          status: "error".to_string(),
          updated_at: crate::now_unix(),
          message: Some(format!("failed to run node ({err})")),
          ..default_gemini_snapshot()
        };
        return (snapshot.clone(), format_gemini_quota_line(&snapshot));
      }
    },
    Err(_) => {
      let snapshot = GeminiQuotaSnapshot {
        status: "error".to_string(),
        updated_at: crate::now_unix(),
        message: Some("timeout".to_string()),
        ..default_gemini_snapshot()
      };
      return (snapshot.clone(), format_gemini_quota_line(&snapshot));
    }
  };

  let stdout = String::from_utf8_lossy(&output.stdout).to_string();
  let json = crate::extract_json_payload(&stdout).unwrap_or_else(|| json!({ "ok": false, "error": "unavailable" }));
  let snapshot = parse_gemini_quota_snapshot_from_json(json);
  let line = format_gemini_quota_line(&snapshot);
  (snapshot, line)
}

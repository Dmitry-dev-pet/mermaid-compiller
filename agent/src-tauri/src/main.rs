use async_stream::stream;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, Method, StatusCode};
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE, HeaderName};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures::Stream;
use serde_json::Value;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::net::SocketAddr;
use std::path::{Component, Path as FsPath, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio::sync::oneshot;
use tokio::sync::{broadcast, Mutex, Notify, RwLock};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
  tasks: Arc<Mutex<HashMap<String, Arc<Task>>>>,
  config: Arc<Config>,
  provider: ProviderKind,
  codex: Option<Arc<CodexAppServer>>,
  token: Arc<RwLock<String>>,
}

#[derive(Clone)]
struct TrayState {
  config: Arc<Config>,
  app_state: Arc<RwLock<Option<AppState>>>,
  menu: Arc<RwLock<Option<TrayMenu>>>,
}

type TrayMenuItem = MenuItem<tauri::Wry>;

#[derive(Clone)]
struct TrayMenu {
  status_title: TrayMenuItem,
  status_details: TrayMenuItem,
  token_line: TrayMenuItem,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct TrayStatusSnapshot {
  title: String,
  details: String,
  token_line: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ProviderKind {
  Codex,
  Gemini,
}

impl ProviderKind {
  fn from_env(raw: Option<String>) -> Self {
    match raw.unwrap_or_else(|| "codex".to_string()).trim().to_ascii_lowercase().as_str() {
      "gemini" | "gemini-cli" | "gemini_cli" => ProviderKind::Gemini,
      _ => ProviderKind::Codex,
    }
  }

  fn as_str(&self) -> &'static str {
    match self {
      ProviderKind::Codex => "codex",
      ProviderKind::Gemini => "gemini",
    }
  }
}

#[derive(Clone)]
struct Config {
  host: String,
  port: u16,
  token: String,
  allowed_roots: Vec<PathBuf>,
  provider: ProviderKind,
  codex_cmd: String,
  codex_login_args: Vec<String>,
  codex_app_server_args: Vec<String>,
  codex_model: Option<String>,
  gemini_cmd: String,
  gemini_args: Vec<String>,
  gemini_model: Option<String>,
  gemini_models: Vec<String>,
  gemini_approval_mode: String,
  gemini_sandbox: bool,
  gemini_login_prompt: Option<String>,
  auto_login: bool,
  ui_dir: Option<PathBuf>,
  cancel_grace_ms: u64,
  task_ttl_ms: u64,
  log_path: Option<PathBuf>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TaskStatus {
  InProgress,
  Completed,
  Error,
  Cancelled,
}

#[derive(Clone, Debug)]
enum TaskEvent {
  Stdout(String),
  Stderr(String),
  Done(TaskStatus, Option<i32>),
  Cancelled,
}

struct Task {
  id: String,
  created_at: u64,
  status: RwLock<TaskStatus>,
  output: RwLock<String>,
  stderr: RwLock<String>,
  model: RwLock<Option<String>>,
  tx: broadcast::Sender<TaskEvent>,
  notify: Notify,
  pid: RwLock<Option<u32>>,
}

struct CodexAppServer {
  stdin: Mutex<tokio::process::ChildStdin>,
  pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>,
  events: broadcast::Sender<Value>,
  next_id: AtomicU64,
  run_lock: Mutex<()>,
  model_override: Option<String>,
}

#[derive(Deserialize)]
struct MessageInput {
  role: String,
  content: String,
}

#[derive(Deserialize)]
struct MetadataInput {
  cwd: Option<String>,
  files: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct OptionsInput {
  mode: Option<String>,
}

#[derive(Deserialize)]
struct ResponsesRequest {
  input: Option<Vec<MessageInput>>,
  stream: Option<bool>,
  metadata: Option<MetadataInput>,
  options: Option<OptionsInput>,
}

#[derive(Deserialize)]
struct ChatCompletionsRequest {
  model: Option<String>,
  messages: Option<Vec<MessageInput>>,
  stream: Option<bool>,
  metadata: Option<MetadataInput>,
  options: Option<OptionsInput>,
}

#[derive(Serialize)]
struct ErrorBody {
  error: String,
}

#[derive(Serialize)]
struct HealthResponse {
  ok: bool,
  agent_version: String,
  codex_detected: bool,
  gemini_detected: bool,
  provider: String,
  port: u16,
}

#[derive(Serialize)]
struct TokenResponse {
  token: String,
}

#[derive(Deserialize)]
struct TokenRequest {
  token: String,
}

#[derive(Serialize)]
struct CapabilitiesResponse {
  supported_api: Vec<String>,
  streaming: Vec<String>,
  modes: Vec<String>,
  allowed_roots: Vec<String>,
}

#[derive(Serialize)]
struct StatusResponse {
  tasks: Vec<TaskStatusInfo>,
}

#[derive(Serialize)]
struct TaskStatusInfo {
  id: String,
  status: String,
  created_at: u64,
}

#[derive(Serialize)]
struct TaskDetailsResponse {
  id: String,
  status: String,
  created_at: u64,
  stdout: String,
  stderr: String,
}

#[derive(Serialize)]
struct ResponsesStartResponse {
  id: String,
  object: String,
  created: u64,
  status: String,
  stream_url: String,
}

#[derive(Serialize)]
struct ChatStartResponse {
  id: String,
  object: String,
  created: u64,
  model: String,
  choices: Vec<serde_json::Value>,
  stream_url: String,
}

#[derive(Serialize)]
struct ModelsResponse {
  object: String,
  data: Vec<ModelInfo>,
}

#[derive(Serialize)]
struct ModelInfo {
  id: String,
  object: String,
  created: u64,
  owned_by: String,
  name: String,
  context_length: u32,
}

fn main() {
  let config = Arc::new(Config::from_env());
  let app_state_slot: Arc<RwLock<Option<AppState>>> = Arc::new(RwLock::new(None));
  let tray_state = Arc::new(TrayState {
    config: config.clone(),
    app_state: app_state_slot.clone(),
    menu: Arc::new(RwLock::new(None)),
  });

  tauri::Builder::default()
    .setup(move |app| {
      let tray = build_tray(&app.handle(), tray_state.clone())?;
      app.manage(tray);

      let config = config.clone();
      let app_state_slot = app_state_slot.clone();
      tauri::async_runtime::spawn(async move {
        start_server(config, app_state_slot).await;
      });

      let tray_state_for_loop = tray_state.clone();
      tauri::async_runtime::spawn(async move {
        tray_status_loop(tray_state_for_loop).await;
      });
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("failed to run tauri app");
}

fn build_tray(app: &AppHandle, tray_state: Arc<TrayState>) -> tauri::Result<tauri::tray::TrayIcon> {
  let config = tray_state.config.clone();
  let status_title = MenuItem::with_id(app, "status_title", "Mermaid Agent — Running", false, None::<&str>)?;
  let status_details = MenuItem::with_id(
    app,
    "status_details",
    format!("v{} · http://{}:{}", env!("CARGO_PKG_VERSION"), config.host, config.port),
    false,
    None::<&str>,
  )?;
  let token_line = MenuItem::with_id(app, "token_line", "Token: (empty)", false, None::<&str>)?;
  let set_token_clipboard = MenuItem::with_id(app, "set_token_clipboard", "Set Token from Clipboard", true, None::<&str>)?;
  let set_token = MenuItem::with_id(app, "set_token", "Set Token…", true, None::<&str>)?;

  let auth_login = MenuItem::with_id(app, "auth_login", "Sign in with Google…", true, None::<&str>)?;
  let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

  let separator_top = PredefinedMenuItem::separator(app)?;

  let menu = Menu::with_items(
    app,
    &[
      &status_title,
      &status_details,
      &token_line,
      &separator_top,
      &set_token_clipboard,
      &set_token,
      &auth_login,
      &quit,
    ],
  )?;

  {
    let mut menu_slot = tray_state.menu.blocking_write();
    *menu_slot = Some(TrayMenu {
      status_title: status_title.clone(),
      status_details: status_details.clone(),
      token_line: token_line.clone(),
    });
  }

  let mut builder = TrayIconBuilder::new().menu(&menu);
  if let Some(icon) = resolve_tray_icon(config.provider) {
    builder = builder.icon(icon);
  } else if let Some(icon) = app.default_window_icon().cloned() {
    builder = builder.icon(icon);
  }
  builder
    .show_menu_on_left_click(true)
    .on_menu_event(move |app, event| {
      handle_tray_menu(app, event.id().as_ref(), tray_state.clone());
    })
    .build(app)
}

fn handle_tray_menu(app: &AppHandle, id: &str, tray_state: Arc<TrayState>) {
  match id {
    "auth_login" => {
      let tray_state = tray_state.clone();
      tauri::async_runtime::spawn(async move {
        let state = tray_state.app_state.read().await.clone();
        let Some(state) = state else {
          eprintln!("[tray] agent not ready for login");
          return;
        };
        match state.provider {
          ProviderKind::Codex => match login_with_fallback(&state).await {
            Ok(response) => {
              if let Some(url) = response.get("verificationUri").and_then(|value| value.as_str()) {
                let _ = open::that(url);
              }
              if let Some(code) = response.get("userCode").and_then(|value| value.as_str()) {
                eprintln!("[auth] user code: {code}");
              }
            }
            Err(err) => {
              eprintln!("[tray] login failed: {err}");
            }
          },
          ProviderKind::Gemini => match login_with_gemini(&state).await {
            Ok(message) => {
              eprintln!("[gemini] {message}");
            }
            Err(err) => {
              eprintln!("[tray] gemini login failed: {err}");
            }
          },
        }
      });
    }
    "set_token" => {
      let tray_state = tray_state.clone();
      tauri::async_runtime::spawn(async move {
        let state = tray_state.app_state.read().await.clone();
        let Some(state) = state else {
          eprintln!("[tray] agent not ready for token");
          return;
        };
        if let Some(token) = prompt_for_token().await {
          update_token(&state, token).await;
        }
      });
    }
    "set_token_clipboard" => {
      let tray_state = tray_state.clone();
      tauri::async_runtime::spawn(async move {
        let state = tray_state.app_state.read().await.clone();
        let Some(state) = state else {
          eprintln!("[tray] agent not ready for token");
          return;
        };
        if let Some(token) = read_token_from_clipboard().await {
          update_token(&state, token).await;
        }
      });
    }
    "quit" => {
      app.exit(0);
    }
    _ => {}
  }
}

async fn start_server(config: Arc<Config>, app_state_slot: Arc<RwLock<Option<AppState>>>) {
  let provider = config.provider;
  let codex = if provider == ProviderKind::Codex {
    Some(CodexAppServer::start(config.clone())
      .await
      .expect("failed to start codex app-server"))
  } else {
    None
  };
  let state = AppState {
    tasks: Arc::new(Mutex::new(HashMap::new())),
    config: config.clone(),
    provider,
    codex,
    token: Arc::new(RwLock::new(config.token.clone())),
  };
  {
    let mut slot = app_state_slot.write().await;
    *slot = Some(state.clone());
  }
  if state.config.auto_login {
    let state_for_login = state.clone();
    tokio::spawn(async move {
      if let Err(err) = login_with_provider(&state_for_login).await {
        eprintln!("[auth] auto-login failed: {err}");
      }
    });
  }

  let mut app = Router::new()
    .route("/api/health", get(health))
    .route("/api/capabilities", get(capabilities))
    .route("/api/status", get(status))
    .route("/api/token", get(get_token).post(set_token))
    .route("/api/tasks/:id", get(task_details))
    .route("/api/cancel", post(cancel))
    .route("/api/auth/login", post(auth_login))
    .route("/api/ui/check-update", post(ui_check_update))
    .route("/api/ui/apply-update", post(ui_apply_update))
    .route("/api/responses", post(responses_start))
    .route("/api/responses/:id/events", get(responses_events))
    .route("/api/chat/completions", post(chat_start))
    .route("/api/chat/completions/:id/events", get(chat_events))
    .route("/v1/chat/completions", post(openai_chat_start))
    .route("/v1/models", get(models))
    .route("/models", get(models))
    .route("/api/models", get(models))
    .with_state(state.clone());

  let cors = CorsLayer::new()
    .allow_origin(Any)
    .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
    .allow_headers([
      AUTHORIZATION,
      CONTENT_TYPE,
      HeaderName::from_static("x-agent-token"),
    ]);

  app = app.layer(cors);

  if let Some(ui_dir) = config.ui_dir.as_ref() {
    let fallback = ServeFile::new(ui_dir.join("index.html"));
    let dir = ServeDir::new(ui_dir).append_index_html_on_directories(true).fallback(fallback);
    app = app.nest_service("/", dir);
  }

  let addr: SocketAddr = format!("{}:{}", config.host, config.port)
    .parse()
    .expect("invalid host/port");

  let listener = tokio::net::TcpListener::bind(addr)
    .await
    .expect("failed to bind listener");

  axum::serve(listener, app).await.expect("server error");
}

async fn tray_status_loop(tray_state: Arc<TrayState>) {
  let mut last_snapshot: Option<TrayStatusSnapshot> = None;
  loop {
    let snapshot = build_tray_status_snapshot(&tray_state).await;
    if last_snapshot.as_ref() != Some(&snapshot) {
      apply_tray_status(&tray_state, &snapshot).await;
      last_snapshot = Some(snapshot);
    }
    tokio::time::sleep(Duration::from_secs(2)).await;
  }
}

async fn build_tray_status_snapshot(tray_state: &TrayState) -> TrayStatusSnapshot {
  let config = tray_state.config.clone();
  let app_state = tray_state.app_state.read().await.clone();
  let mut task_count = 0usize;
  if let Some(state) = app_state.as_ref() {
    let tasks = state.tasks.lock().await;
    task_count = tasks.len();
  }

  let status_label = if app_state.is_none() {
    "Starting"
  } else if is_server_reachable(&config).await {
    "Online"
  } else {
    "Offline"
  };

  let codex_detected = which_codex(&config.codex_cmd);
  let gemini_detected = which_gemini(&config.gemini_cmd);
  let token_value = if let Some(state) = app_state.as_ref() {
    state.token.read().await.clone()
  } else {
    config.token.clone()
  };
  let logs_configured = config.log_path.is_some();

  let mut details = format!("v{} · http://{}:{}", env!("CARGO_PKG_VERSION"), config.host, config.port);
  details.push_str(&format!(" · provider: {}", config.provider.as_str()));
  if codex_detected {
    details.push_str(" · codex ok");
  } else {
    details.push_str(" · codex missing");
  }
  if gemini_detected {
    details.push_str(" · gemini ok");
  } else {
    details.push_str(" · gemini missing");
  }
  if task_count > 0 {
    details.push_str(&format!(" · tasks: {}", task_count));
  }
  if logs_configured {
    details.push_str(" · logs configured");
  }
  if app_state.is_some() && status_label == "Offline" {
    details.push_str(" · unreachable");
  }

  TrayStatusSnapshot {
    title: format!("Mermaid Agent — {}", status_label),
    details,
    token_line: format!("Token: {}", mask_token(&token_value)),
  }
}

async fn apply_tray_status(tray_state: &TrayState, snapshot: &TrayStatusSnapshot) {
  let menu = tray_state.menu.read().await;
  let Some(menu) = menu.as_ref() else {
    return;
  };
  let _ = menu.status_title.set_text(&snapshot.title);
  let _ = menu.status_details.set_text(&snapshot.details);
  let _ = menu.token_line.set_text(&snapshot.token_line);
}

fn mask_token(token: &str) -> String {
  let trimmed = token.trim();
  if trimmed.is_empty() {
    return "(empty)".to_string();
  }
  trimmed.to_string()
}

fn resolve_tray_icon(provider: ProviderKind) -> Option<tauri::image::Image<'static>> {
  let bytes: &[u8] = match provider {
    ProviderKind::Codex => include_bytes!("../icons/openai-chatgpt-logo-icon-free-png.png"),
    ProviderKind::Gemini => include_bytes!("../icons/Google_Gemini_icon_2025.svg.png"),
  };
  tauri::image::Image::from_bytes(bytes).ok()
}

async fn prompt_for_token() -> Option<String> {
  #[cfg(target_os = "macos")]
  {
    let script = r#"display dialog "Enter agent token:" default answer "" with title "Mermaid Agent" buttons {"Cancel","OK"} default button "OK" with hidden answer"#;
    let output = Command::new("osascript")
      .arg("-e")
      .arg(script)
      .output()
      .await
      .ok()?;
    if !output.status.success() {
      return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let value = stdout
      .split("text returned:")
      .nth(1)
      .map(|s| s.trim().to_string())
      .unwrap_or_default();
    return Some(value);
  }
  #[cfg(not(target_os = "macos"))]
  {
    None
  }
}

async fn read_token_from_clipboard() -> Option<String> {
  #[cfg(target_os = "macos")]
  {
    let output = Command::new("pbpaste").output().await.ok()?;
    if !output.status.success() {
      return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
      None
    } else {
      Some(value)
    }
  }
  #[cfg(not(target_os = "macos"))]
  {
    None
  }
}

async fn is_server_reachable(config: &Config) -> bool {
  let host = normalize_host_for_check(&config.host);
  let addr = format!("{}:{}", host, config.port);
  match tokio::time::timeout(Duration::from_millis(200), tokio::net::TcpStream::connect(addr)).await {
    Ok(Ok(stream)) => {
      drop(stream);
      true
    }
    _ => false,
  }
}

fn normalize_host_for_check(host: &str) -> &str {
  match host {
    "0.0.0.0" | "::" => "127.0.0.1",
    other => other,
  }
}

async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
  Json(HealthResponse {
    ok: true,
    agent_version: "0.1.0".to_string(),
    codex_detected: which_codex(&state.config.codex_cmd),
    gemini_detected: which_gemini(&state.config.gemini_cmd),
    provider: state.provider.as_str().to_string(),
    port: state.config.port,
  })
}

async fn capabilities(State(state): State<AppState>) -> Json<CapabilitiesResponse> {
  Json(CapabilitiesResponse {
    supported_api: vec!["responses".to_string(), "chat.completions".to_string()],
    streaming: vec!["sse".to_string()],
    modes: vec!["chat".to_string(), "analyze".to_string(), "edit".to_string()],
    allowed_roots: state
      .config
      .allowed_roots
      .iter()
      .map(|root| root.to_string_lossy().to_string())
      .collect(),
  })
}

async fn status(State(state): State<AppState>) -> Json<StatusResponse> {
  let tasks = state.tasks.lock().await;
  let mut items = Vec::with_capacity(tasks.len());
  for task in tasks.values() {
    let status = task.status.read().await;
    items.push(TaskStatusInfo {
      id: task.id.clone(),
      status: status_to_string(*status).to_string(),
      created_at: task.created_at,
    });
  }
  Json(StatusResponse { tasks: items })
}

async fn get_token(State(state): State<AppState>) -> Json<TokenResponse> {
  let token = state.token.read().await.clone();
  Json(TokenResponse { token })
}

async fn set_token(
  State(state): State<AppState>,
  Json(payload): Json<TokenRequest>,
) -> Json<TokenResponse> {
  update_token(&state, payload.token).await;
  let token = state.token.read().await.clone();
  Json(TokenResponse { token })
}

async fn update_token(state: &AppState, token: String) {
  let mut slot = state.token.write().await;
  *slot = token;
}

async fn task_details(
  State(state): State<AppState>,
  Path(id): Path<String>,
  headers: HeaderMap,
) -> Result<Json<TaskDetailsResponse>, (StatusCode, Json<ErrorBody>)> {
  authorize(&state, &headers).await?;
  let task = {
    let tasks = state.tasks.lock().await;
    tasks.get(&id).cloned()
  };
  let Some(task) = task else {
    return Err((StatusCode::NOT_FOUND, Json(ErrorBody { error: "task not found".to_string() })));
  };
  let status = *task.status.read().await;
  let stdout = task.output.read().await.clone();
  let stderr = task.stderr.read().await.clone();
  Ok(Json(TaskDetailsResponse {
    id: task.id.clone(),
    status: status_to_string(status).to_string(),
    created_at: task.created_at,
    stdout,
    stderr,
  }))
}

async fn ui_check_update(
  State(state): State<AppState>,
  headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorBody>)> {
  authorize(&state, &headers).await?;
  Ok(Json(json!({ "ok": false, "reason": "not_implemented" })))
}

async fn ui_apply_update(
  State(state): State<AppState>,
  headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorBody>)> {
  authorize(&state, &headers).await?;
  Ok(Json(json!({ "ok": false, "reason": "not_implemented" })))
}

async fn cancel(
  State(state): State<AppState>,
  headers: HeaderMap,
  Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorBody>)> {
  authorize(&state, &headers).await?;
  let id = payload.get("id").and_then(|value| value.as_str()).unwrap_or("");
  if id.is_empty() {
    return Err((StatusCode::BAD_REQUEST, Json(ErrorBody { error: "id is required".to_string() })));
  }
  let task = {
    let tasks = state.tasks.lock().await;
    tasks.get(id).cloned()
  };
  let Some(task) = task else {
    return Err((StatusCode::NOT_FOUND, Json(ErrorBody { error: "task not found".to_string() })));
  };
  cancel_task(task, state.config.cancel_grace_ms).await;
  Ok(Json(json!({ "ok": true })))
}

async fn auth_login(
  State(state): State<AppState>,
  headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorBody>)> {
  authorize(&state, &headers).await?;
  match state.provider {
    ProviderKind::Codex => {
      let response = login_with_fallback(&state).await.map_err(|err| {
        (StatusCode::BAD_REQUEST, Json(ErrorBody { error: err }))
      })?;

      let auth_url = response.get("verificationUri").and_then(|value| value.as_str()).map(|value| value.to_string());
      let user_code = response.get("userCode").and_then(|value| value.as_str()).map(|value| value.to_string());
      let expires_in = response.get("expiresIn").and_then(|value| value.as_u64());
      let interval = response.get("interval").and_then(|value| value.as_u64());

      Ok(Json(json!({
        "ok": true,
        "message": "Login started. Complete it in the opened browser.".to_string(),
        "auth_url": auth_url,
        "user_code": user_code,
        "expires_in": expires_in,
        "interval": interval
      })))
    }
    ProviderKind::Gemini => {
      let message = login_with_gemini(&state).await.map_err(|err| {
        (StatusCode::BAD_REQUEST, Json(ErrorBody { error: err }))
      })?;
      Ok(Json(json!({
        "ok": true,
        "message": message
      })))
    }
  }
}

async fn login_with_fallback(state: &AppState) -> Result<Value, String> {
  let codex = state.codex.as_ref().ok_or("codex provider unavailable")?;
  let mut response = codex.login_chatgpt().await?;
  let has_url = response.get("verificationUri")
    .and_then(|value| value.as_str())
    .map(|value| !value.trim().is_empty())
    .unwrap_or(false);
  if has_url {
    return Ok(response);
  }

  let mut command = Command::new(&state.config.codex_cmd);
  command
    .args(state.config.codex_login_args.clone())
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

  let output = command.output().await.map_err(|err| format!("failed to run codex login: {err}"))?;
  let stdout = String::from_utf8_lossy(&output.stdout).to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).to_string();

  if !output.status.success() {
    let message = if stderr.trim().is_empty() {
      format!("codex login failed with status {}", output.status)
    } else {
      stderr.trim().to_string()
    };
    return Err(message);
  }

  if let Some(obj) = response.as_object_mut() {
    obj.insert("fallback".to_string(), Value::String("cli".to_string()));
    if !stdout.trim().is_empty() {
      obj.insert("fallback_stdout".to_string(), Value::String(stdout.trim().to_string()));
    }
    if !stderr.trim().is_empty() {
      obj.insert("fallback_stderr".to_string(), Value::String(stderr.trim().to_string()));
    }
  }
  Ok(response)
}

async fn login_with_provider(state: &AppState) -> Result<(), String> {
  match state.provider {
    ProviderKind::Codex => {
      let _ = login_with_fallback(state).await?;
      Ok(())
    }
    ProviderKind::Gemini => {
      let _ = login_with_gemini(state).await?;
      Ok(())
    }
  }
}

async fn login_with_gemini(state: &AppState) -> Result<String, String> {
  let prompt = state
    .config
    .gemini_login_prompt
    .clone()
    .unwrap_or_else(|| "login".to_string());
  let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
  let response = run_gemini_once(&state.config, prompt, cwd).await?;
  if let Some(message) = response.get("response").and_then(|value| value.as_str()) {
    Ok(message.to_string())
  } else {
    Ok("Gemini CLI invoked. Complete login in the browser if prompted.".to_string())
  }
}

async fn run_gemini_once(
  config: &Config,
  prompt: String,
  cwd: PathBuf,
) -> Result<Value, String> {
  let mut command = build_gemini_command(config, &prompt, "json", &cwd, None);
  let output = command.output().await.map_err(|err| format!("failed to run gemini cli: {err}"))?;
  let stdout = String::from_utf8_lossy(&output.stdout).to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).to_string();

  if !output.status.success() {
    let message = if stderr.trim().is_empty() {
      format!("gemini cli failed with status {}", output.status)
    } else {
      stderr.trim().to_string()
    };
    return Err(message);
  }

  extract_json_payload(&stdout).ok_or_else(|| {
    if stdout.trim().is_empty() {
      "gemini cli returned empty response".to_string()
    } else {
      format!("failed to parse gemini cli response: {}", stdout.trim())
    }
  })
}

fn build_gemini_command(
  config: &Config,
  prompt: &str,
  output_format: &str,
  cwd: &PathBuf,
  model_override: Option<&str>,
) -> Command {
  let mut command = Command::new(&config.gemini_cmd);
  if !config.gemini_args.is_empty() {
    command.args(config.gemini_args.clone());
  }
  command.arg("--output-format").arg(output_format);
  let model = model_override
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(|value| value.to_string())
    .or_else(|| config.gemini_model.clone())
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty() && !value.eq_ignore_ascii_case("auto"));
  if let Some(model) = model {
    command.arg("--model").arg(model);
  } // else: let Gemini CLI pick its default / auto model
  if !config.gemini_approval_mode.trim().is_empty() {
    command.arg("--approval-mode").arg(config.gemini_approval_mode.trim());
  }
  if config.gemini_sandbox {
    command.arg("--sandbox");
  }
  command.arg(prompt);
  command.current_dir(cwd);
  command.stdin(Stdio::null());
  command.stdout(Stdio::piped());
  command.stderr(Stdio::piped());
  command
}

fn extract_json_payload(raw: &str) -> Option<Value> {
  let start = raw.find('{')?;
  let end = raw.rfind('}')?;
  let slice = raw.get(start..=end)?;
  serde_json::from_str(slice).ok()
}

async fn responses_start(
  State(state): State<AppState>,
  headers: HeaderMap,
  Json(payload): Json<ResponsesRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorBody>)> {
  authorize(&state, &headers).await?;
  let metadata = payload.metadata;
  let options = payload.options;
  let input = payload.input.unwrap_or_default();

  let validated = validate_metadata(&state.config, metadata)?;
  let prompt = build_prompt(&input, &validated, options.as_ref());
  let task = spawn_task(state.clone(), prompt, validated.cwd, None).await?;

  if payload.stream.unwrap_or(true) {
    let response = ResponsesStartResponse {
      id: task.id.clone(),
      object: "response".to_string(),
      created: now_unix(),
      status: "in_progress".to_string(),
      stream_url: format!("/api/responses/{}/events", task.id),
    };
    Ok(Json(serde_json::to_value(response).unwrap_or(json!({}))))
  } else {
    wait_for_task(task.clone()).await;
    let output = task.output.read().await.clone();
    let status = *task.status.read().await;
    Ok(Json(json!({
      "id": task.id,
      "object": "response",
      "created": now_unix(),
      "status": status_to_string(status),
      "output": output
    })))
  }
}

async fn models(
  State(state): State<AppState>,
  _headers: HeaderMap,
) -> Result<Json<ModelsResponse>, (StatusCode, Json<ErrorBody>)> {
  let mut data = match state.codex.as_ref().map(|codex| codex.list_models()) {
    Some(fut) => match fut.await {
      Ok(list) if !list.is_empty() => list,
      Ok(_) | Err(_) => fallback_codex_models(&state.config),
    },
    None => fallback_codex_models(&state.config),
  };
  data.extend(fallback_gemini_models(&state.config));
  Ok(Json(ModelsResponse {
    object: "list".to_string(),
    data,
  }))
}

fn fallback_codex_models(config: &Config) -> Vec<ModelInfo> {
  if which_codex(&config.codex_cmd) {
    vec![ModelInfo {
      id: "codex".to_string(),
      object: "model".to_string(),
      created: now_unix(),
      owned_by: "openai".to_string(),
      name: "Codex".to_string(),
      context_length: 0,
    }]
  } else {
    Vec::new()
  }
}

fn fallback_gemini_models(config: &Config) -> Vec<ModelInfo> {
  if which_gemini(&config.gemini_cmd) {
    let now = now_unix();
    gemini_model_ids(config)
      .into_iter()
      .map(|id| ModelInfo {
        id: format!("gemini:{id}"),
        object: "model".to_string(),
        created: now,
        owned_by: "google".to_string(),
        name: if id.eq_ignore_ascii_case("auto") {
          "Gemini (auto)".to_string()
        } else {
          format!("Gemini: {id}")
        },
        context_length: 0,
      })
      .collect()
  } else {
    Vec::new()
  }
}

async fn chat_start(
  State(state): State<AppState>,
  headers: HeaderMap,
  Json(payload): Json<ChatCompletionsRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorBody>)> {
  chat_start_with_defaults(state, headers, payload, true).await
}

async fn openai_chat_start(
  State(state): State<AppState>,
  headers: HeaderMap,
  Json(payload): Json<ChatCompletionsRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorBody>)> {
  chat_start_with_defaults(state, headers, payload, false).await
}

async fn chat_start_with_defaults(
  state: AppState,
  headers: HeaderMap,
  payload: ChatCompletionsRequest,
  default_stream: bool,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorBody>)> {
  authorize(&state, &headers).await?;
  let requested_model = payload.model.clone();
  let messages = payload.messages.unwrap_or_default();
  let validated = validate_metadata(&state.config, payload.metadata)?;
  let prompt = build_prompt(&messages, &validated, payload.options.as_ref());

  let should_stream = payload.stream.unwrap_or(default_stream);

  if should_stream {
    let task = spawn_task(state.clone(), prompt, validated.cwd, requested_model.clone()).await?;
    let response = ChatStartResponse {
      id: task.id.clone(),
      object: "chat.completion".to_string(),
      created: now_unix(),
      model: requested_model.unwrap_or_else(|| state.provider.as_str().to_string()),
      choices: Vec::new(),
      stream_url: format!("/api/chat/completions/{}/events", task.id),
    };
    Ok(Json(serde_json::to_value(response).unwrap_or(json!({}))))
  } else {
    let task = spawn_task(state.clone(), prompt, validated.cwd, requested_model).await?;
    wait_for_task(task.clone()).await;
    let output = task.output.read().await.clone();
    let status = *task.status.read().await;
    let model_id = task.model.read().await.clone();
    Ok(Json(json!({
      "id": format!("turn_{}", now_unix()),
      "object": "chat.completion",
      "created": now_unix(),
      "model": model_id.unwrap_or_else(|| state.provider.as_str().to_string()),
      "choices": [{ "index": 0, "message": { "role": "assistant", "content": output } }],
      "status": status_to_string(status)
    })))
  }
}

async fn responses_events(
  State(state): State<AppState>,
  Path(id): Path<String>,
) -> Result<Sse<impl Stream<Item = Result<Event, axum::Error>>>, StatusCode> {
  let task = {
    let tasks = state.tasks.lock().await;
    tasks.get(&id).cloned()
  };
  let Some(task) = task else {
    return Err(StatusCode::NOT_FOUND);
  };
  Ok(Sse::new(build_responses_stream(task)).keep_alive(KeepAlive::default()))
}

async fn chat_events(
  State(state): State<AppState>,
  Path(id): Path<String>,
) -> Result<Sse<impl Stream<Item = Result<Event, axum::Error>>>, StatusCode> {
  let task = {
    let tasks = state.tasks.lock().await;
    tasks.get(&id).cloned()
  };
  let Some(task) = task else {
    return Err(StatusCode::NOT_FOUND);
  };
  Ok(Sse::new(build_chat_stream(task)).keep_alive(KeepAlive::default()))
}

fn build_responses_stream(task: Arc<Task>) -> impl Stream<Item = Result<Event, axum::Error>> {
  stream! {
    let task_id = task.id.clone();
    let output = task.output.read().await.clone();
    if !output.is_empty() {
      yield Ok(Event::default().event("response.output_text.delta").data(json!({"id": task_id.clone(), "delta": output}).to_string()));
    }

    let status = *task.status.read().await;
    if status != TaskStatus::InProgress {
      let final_output = task.output.read().await.clone();
      yield Ok(Event::default().event("response.output_text.done").data(json!({"id": task_id.clone(), "text": final_output}).to_string()));
      yield Ok(Event::default().event("response.done").data(json!({"id": task_id.clone(), "status": status_to_string(status)}).to_string()));
      return;
    }

    let rx = task.tx.subscribe();
    let mut stream = BroadcastStream::new(rx);
    while let Some(Ok(event)) = stream.next().await {
      match event {
        TaskEvent::Stdout(text) => {
          yield Ok(Event::default().event("response.output_text.delta").data(json!({"id": task_id.clone(), "delta": text}).to_string()));
        }
        TaskEvent::Stderr(text) => {
          yield Ok(Event::default().event("response.error").data(json!({"id": task_id.clone(), "message": text}).to_string()));
        }
        TaskEvent::Cancelled => {
          yield Ok(Event::default().event("response.done").data(json!({"id": task_id.clone(), "status": "cancelled"}).to_string()));
          break;
        }
        TaskEvent::Done(status, code) => {
          let final_output = task.output.read().await.clone();
          yield Ok(Event::default().event("response.output_text.done").data(json!({"id": task_id.clone(), "text": final_output}).to_string()));
          yield Ok(Event::default().event("response.done").data(json!({"id": task_id.clone(), "status": status_to_string(status), "exit_code": code}).to_string()));
          break;
        }
      }
    }
  }
}

fn build_chat_stream(task: Arc<Task>) -> impl Stream<Item = Result<Event, axum::Error>> {
  stream! {
    let task_id = task.id.clone();
    let output = task.output.read().await.clone();
    if !output.is_empty() {
      yield Ok(Event::default().event("chat.completion.chunk").data(json!({"id": task_id.clone(), "choices": [{"index": 0, "delta": {"content": output}}]}).to_string()));
    }

    let status = *task.status.read().await;
    if status != TaskStatus::InProgress {
      let final_output = task.output.read().await.clone();
      yield Ok(Event::default().event("chat.completion.done").data(json!({"id": task_id.clone(), "choices": [{"index": 0, "message": {"role": "assistant", "content": final_output}}], "status": status_to_string(status)}).to_string()));
      return;
    }

    let rx = task.tx.subscribe();
    let mut stream = BroadcastStream::new(rx);
    while let Some(Ok(event)) = stream.next().await {
      match event {
        TaskEvent::Stdout(text) => {
          yield Ok(Event::default().event("chat.completion.chunk").data(json!({"id": task_id.clone(), "choices": [{"index": 0, "delta": {"content": text}}]}).to_string()));
        }
        TaskEvent::Stderr(text) => {
          yield Ok(Event::default().event("error").data(json!({"id": task_id.clone(), "message": text}).to_string()));
        }
        TaskEvent::Cancelled => {
          yield Ok(Event::default().event("chat.completion.done").data(json!({"id": task_id.clone(), "choices": [{"index": 0, "message": {"role": "assistant", "content": ""}}], "status": "cancelled"}).to_string()));
          break;
        }
        TaskEvent::Done(status, code) => {
          let final_output = task.output.read().await.clone();
          let model_id = task.model.read().await.clone().unwrap_or_else(|| "codex".to_string());
          yield Ok(Event::default().event("chat.completion.done").data(json!({"id": task_id.clone(), "choices": [{"index": 0, "message": {"role": "assistant", "content": final_output}}], "status": status_to_string(status), "exit_code": code, "model": model_id}).to_string()));
          break;
        }
      }
    }
  }
}

async fn spawn_task(
  state: AppState,
  prompt: String,
  cwd: PathBuf,
  requested_model: Option<String>,
) -> Result<Arc<Task>, (StatusCode, Json<ErrorBody>)> {
  let (provider, model_override) = resolve_provider_and_model(state.provider, requested_model.as_deref());
  match provider {
    ProviderKind::Codex => spawn_codex_task(state, prompt, model_override).await,
    ProviderKind::Gemini => spawn_gemini_task(state, prompt, cwd, model_override).await,
  }
}

async fn spawn_codex_task(
  state: AppState,
  prompt: String,
  requested_model: Option<String>,
) -> Result<Arc<Task>, (StatusCode, Json<ErrorBody>)> {
  let codex = state.codex.clone().ok_or_else(|| {
    (StatusCode::BAD_REQUEST, Json(ErrorBody { error: "codex provider unavailable".to_string() }))
  })?;
  let id = format!("task_{}", Uuid::new_v4().simple());
  let (tx, _) = broadcast::channel(32);
  let task = Arc::new(Task {
    id: id.clone(),
    created_at: now_unix(),
    status: RwLock::new(TaskStatus::InProgress),
    output: RwLock::new(String::new()),
    stderr: RwLock::new(String::new()),
    model: RwLock::new(None),
    tx,
    notify: Notify::new(),
    pid: RwLock::new(None),
  });

  let task_clone = task.clone();
  let tasks_clone = state.tasks.clone();
  let ttl = state.config.task_ttl_ms;
  let id_for_cleanup = id.clone();
  let model_override = requested_model.clone();
  tokio::spawn(async move {
    let result = codex
      .run_chat_stream(prompt, Some(task_clone.tx.clone()), model_override)
      .await;
    match result {
      Ok((output, status, error, model_id)) => {
        {
          let mut out = task_clone.output.write().await;
          *out = output;
        }
        {
          let mut model_slot = task_clone.model.write().await;
          *model_slot = model_id;
        }
        if let Some(message) = error {
          let mut err = task_clone.stderr.write().await;
          err.push_str(&message);
        }
        let final_status = if status == "completed" { TaskStatus::Completed } else { TaskStatus::Error };
        finalize_task(task_clone.clone(), final_status, None).await;
      }
      Err(message) => {
        {
          let mut err = task_clone.stderr.write().await;
          err.push_str(&message);
        }
        finalize_task(task_clone.clone(), TaskStatus::Error, None).await;
      }
    }
    schedule_cleanup(tasks_clone, id_for_cleanup, ttl).await;
  });

  state.tasks.lock().await.insert(id.clone(), task.clone());
  Ok(task)
}

async fn spawn_gemini_task(
  state: AppState,
  prompt: String,
  cwd: PathBuf,
  requested_model: Option<String>,
) -> Result<Arc<Task>, (StatusCode, Json<ErrorBody>)> {
  let id = format!("task_{}", Uuid::new_v4().simple());
  let (tx, _) = broadcast::channel(32);
  let task = Arc::new(Task {
    id: id.clone(),
    created_at: now_unix(),
    status: RwLock::new(TaskStatus::InProgress),
    output: RwLock::new(String::new()),
    stderr: RwLock::new(String::new()),
    model: RwLock::new(None),
    tx,
    notify: Notify::new(),
    pid: RwLock::new(None),
  });

  let task_clone = task.clone();
  let tasks_clone = state.tasks.clone();
  let ttl = state.config.task_ttl_ms;
  let id_for_cleanup = id.clone();
  let config = state.config.clone();
  let model_override = requested_model.clone();
  tokio::spawn(async move {
    let mut command = build_gemini_command(&config, &prompt, "stream-json", &cwd, model_override.as_deref());
    let mut child = match command.spawn() {
      Ok(child) => child,
      Err(err) => {
        let mut err_slot = task_clone.stderr.write().await;
        err_slot.push_str(&format!("failed to spawn gemini cli: {err}"));
        finalize_task(task_clone.clone(), TaskStatus::Error, None).await;
        schedule_cleanup(tasks_clone, id_for_cleanup, ttl).await;
        return;
      }
    };

    if let Some(pid) = child.id() {
      let mut pid_slot = task_clone.pid.write().await;
      *pid_slot = Some(pid);
    }

    let stdout = match child.stdout.take() {
      Some(stdout) => stdout,
      None => {
        let mut err_slot = task_clone.stderr.write().await;
        err_slot.push_str("gemini cli stdout unavailable");
        finalize_task(task_clone.clone(), TaskStatus::Error, None).await;
        schedule_cleanup(tasks_clone, id_for_cleanup, ttl).await;
        return;
      }
    };
    let stderr = child.stderr.take();

    let stderr_handle = tokio::spawn(async move {
      if let Some(stderr) = stderr {
        let mut reader = tokio::io::BufReader::new(stderr);
        let mut buf = String::new();
        let _ = reader.read_to_string(&mut buf).await;
        buf
      } else {
        String::new()
      }
    });

    let mut reader = tokio::io::BufReader::new(stdout);
    let mut line = String::new();
    let mut output = String::new();
    let mut model_id: Option<String> = None;

    loop {
      line.clear();
      let bytes = match reader.read_line(&mut line).await {
        Ok(0) => break,
        Ok(n) => n,
        Err(_) => break,
      };
      if bytes == 0 {
        break;
      }
      let trimmed = line.trim();
      if trimmed.is_empty() {
        continue;
      }
      let parsed: Result<Value, _> = serde_json::from_str(trimmed);
      if let Ok(value) = parsed {
        if let Some(kind) = value.get("type").and_then(|v| v.as_str()) {
          match kind {
            "init" => {
              if let Some(model) = value.get("model").and_then(|v| v.as_str()) {
                model_id = Some(format!("gemini:{model}"));
              }
            }
            "message" => {
              let role = value.get("role").and_then(|v| v.as_str());
              if role == Some("assistant") {
                if let Some(content) = value.get("content").and_then(|v| v.as_str()) {
                  let is_delta = value.get("delta").and_then(|v| v.as_bool()).unwrap_or(false);
                  if is_delta {
                    output.push_str(content);
                    let _ = task_clone.tx.send(TaskEvent::Stdout(content.to_string()));
                  } else {
                    output = content.to_string();
                    if output.is_empty() {
                      let _ = task_clone.tx.send(TaskEvent::Stdout(content.to_string()));
                    }
                  }
                }
              }
            }
            _ => {}
          }
        }
      } else {
        let _ = task_clone.tx.send(TaskEvent::Stderr(trimmed.to_string()));
      }
    }

    let exit_status = child.wait().await.ok();
    let stderr_text = stderr_handle.await.unwrap_or_default();
    if !stderr_text.trim().is_empty() {
      let trimmed = stderr_text.trim();
      let mut err_slot = task_clone.stderr.write().await;
      err_slot.push_str(trimmed);
      let _ = task_clone.tx.send(TaskEvent::Stderr(trimmed.to_string()));
    }

    {
      let mut out = task_clone.output.write().await;
      *out = output;
    }
    {
      let mut model_slot = task_clone.model.write().await;
      if model_id.is_none() {
        let fallback = model_override
          .clone()
          .or_else(|| config.gemini_model.clone())
          .filter(|value| !value.trim().is_empty())
          .unwrap_or_else(|| "auto".to_string());
        model_id = Some(format!("gemini:{fallback}"));
      }
      *model_slot = model_id;
    }

    let success = exit_status.map(|status| status.success()).unwrap_or(false);
    let final_status = if success { TaskStatus::Completed } else { TaskStatus::Error };
    finalize_task(task_clone.clone(), final_status, exit_status.and_then(|status| status.code())).await;
    schedule_cleanup(tasks_clone, id_for_cleanup, ttl).await;
  });

  state.tasks.lock().await.insert(id.clone(), task.clone());
  Ok(task)
}

async fn finalize_task(task: Arc<Task>, status: TaskStatus, code: Option<i32>) {
  {
    let mut task_status = task.status.write().await;
    if *task_status != TaskStatus::InProgress {
      return;
    }
    *task_status = status;
  }
  let _ = task.tx.send(TaskEvent::Done(status, code));
  task.notify.notify_waiters();
}

async fn wait_for_task(task: Arc<Task>) {
  loop {
    if *task.status.read().await != TaskStatus::InProgress {
      break;
    }
    task.notify.notified().await;
  }
}

async fn cancel_task(task: Arc<Task>, grace_ms: u64) {
  {
    let status = task.status.read().await;
    if *status != TaskStatus::InProgress {
      return;
    }
  }

  let pid = *task.pid.read().await;
  if let Some(pid) = pid {
    #[cfg(unix)]
    {
      let _ = nix::sys::signal::kill(nix::unistd::Pid::from_raw(pid as i32), nix::sys::signal::Signal::SIGTERM);
    }
    #[cfg(not(unix))]
    {
      let _ = pid;
    }

    tokio::time::sleep(Duration::from_millis(grace_ms)).await;

    let status = task.status.read().await;
    if *status == TaskStatus::InProgress {
      #[cfg(unix)]
      {
        let _ = nix::sys::signal::kill(nix::unistd::Pid::from_raw(pid as i32), nix::sys::signal::Signal::SIGKILL);
      }
    }
  }

  {
    let mut task_status = task.status.write().await;
    *task_status = TaskStatus::Cancelled;
  }
  let _ = task.tx.send(TaskEvent::Cancelled);
  task.notify.notify_waiters();
}

async fn schedule_cleanup(tasks: Arc<Mutex<HashMap<String, Arc<Task>>>>, id: String, ttl: u64) {
  tokio::time::sleep(Duration::from_millis(ttl)).await;
  tasks.lock().await.remove(&id);
}

fn build_prompt(messages: &[MessageInput], metadata: &ValidatedMetadata, options: Option<&OptionsInput>) -> String {
  let mut system_parts = Vec::new();
  let mut conversation = Vec::new();

  for message in messages {
    if message.role == "system" {
      system_parts.push(message.content.as_str());
    } else {
      conversation.push((message.role.as_str(), message.content.as_str()));
    }
  }

  let mut parts = Vec::new();
  if !system_parts.is_empty() {
    parts.push(format!("SYSTEM:\n{}", system_parts.join("\n\n")));
  }
  for (role, content) in conversation {
    parts.push(format!("{}:\n{}", role.to_uppercase(), content));
  }

  let mut context_lines = Vec::new();
  context_lines.push(format!("cwd: {}", metadata.cwd.to_string_lossy()));
  if !metadata.files.is_empty() {
    let files = metadata
      .files
      .iter()
      .map(|path| path.to_string_lossy())
      .collect::<Vec<_>>()
      .join(", ");
    context_lines.push(format!("files: {files}"));
  }
  parts.push(format!("CONTEXT:\n{}", context_lines.join("\n")));

  let mode = normalize_mode(options.and_then(|opt| opt.mode.as_deref()));
  parts.push(format!("MODE:\n{mode}"));

  parts.join("\n\n") + "\n"
}

#[derive(Clone)]
struct ValidatedMetadata {
  cwd: PathBuf,
  files: Vec<PathBuf>,
}

fn validate_metadata(
  config: &Config,
  metadata: Option<MetadataInput>,
) -> Result<ValidatedMetadata, (StatusCode, Json<ErrorBody>)> {
  let cwd = metadata.as_ref().and_then(|meta| meta.cwd.as_ref()).map(|s| s.as_str()).unwrap_or(".");
  let cwd_path = normalize_path(&PathBuf::from(cwd), &std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
  if !is_within_roots(&cwd_path, &config.allowed_roots) {
    return Err((StatusCode::BAD_REQUEST, Json(ErrorBody { error: "cwd is outside allowed roots".to_string() })));
  }

  let mut files = Vec::new();
  if let Some(file_list) = metadata.and_then(|meta| meta.files) {
    for file in file_list {
      let path = PathBuf::from(&file);
      let resolved = if path.is_absolute() {
        normalize_path(&path, &cwd_path)
      } else {
        normalize_path(&cwd_path.join(path), &cwd_path)
      };
      if !is_within_roots(&resolved, &config.allowed_roots) {
        return Err((StatusCode::BAD_REQUEST, Json(ErrorBody { error: format!("file is outside allowed roots: {file}") })));
      }
      files.push(resolved);
    }
  }

  Ok(ValidatedMetadata { cwd: cwd_path, files })
}

fn normalize_mode(mode: Option<&str>) -> &'static str {
  match mode.unwrap_or("chat") {
    "chat" => "chat",
    "analyze" => "analyze",
    "edit" => "edit",
    _ => "chat",
  }
}

fn normalize_path(path: &PathBuf, base: &PathBuf) -> PathBuf {
  let combined = if path.is_absolute() { path.clone() } else { base.join(path) };
  let mut normalized = PathBuf::new();
  for component in combined.components() {
    match component {
      Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
      Component::RootDir => normalized.push(FsPath::new(std::path::MAIN_SEPARATOR_STR)),
      Component::CurDir => {}
      Component::ParentDir => {
        normalized.pop();
      }
      Component::Normal(part) => normalized.push(part),
    }
  }
  normalized
}

fn is_within_roots(path: &PathBuf, roots: &[PathBuf]) -> bool {
  roots.iter().any(|root| path.starts_with(root))
}

async fn authorize(state: &AppState, headers: &HeaderMap) -> Result<(), (StatusCode, Json<ErrorBody>)> {
  let token_value = state.token.read().await;
  if token_value.is_empty() {
    return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorBody { error: "AGENT_TOKEN is not set".to_string() })));
  }
  let token_from_header = headers
    .get("X-Agent-Token")
    .and_then(|value| value.to_str().ok())
    .filter(|value| !value.is_empty());
  let token_from_bearer = headers
    .get(AUTHORIZATION)
    .and_then(|value| value.to_str().ok())
    .and_then(|value| value.strip_prefix("Bearer "))
    .filter(|value| !value.is_empty());
  let token = token_from_header.or(token_from_bearer).unwrap_or("");
  if token != token_value.as_str() {
    return Err((StatusCode::UNAUTHORIZED, Json(ErrorBody { error: "unauthorized".to_string() })));
  }
  Ok(())
}

fn status_to_string(status: TaskStatus) -> &'static str {
  match status {
    TaskStatus::InProgress => "in_progress",
    TaskStatus::Completed => "completed",
    TaskStatus::Error => "error",
    TaskStatus::Cancelled => "cancelled",
  }
}

fn now_unix() -> u64 {
  SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
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

fn which_codex(command: &str) -> bool {
  which_command(command)
}

fn which_gemini(command: &str) -> bool {
  which_command(command)
}

impl Config {
  fn from_env() -> Self {
    let host = std::env::var("AGENT_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = std::env::var("AGENT_PORT")
      .or_else(|_| std::env::var("PORT"))
      .ok()
      .and_then(|value| value.parse().ok())
      .unwrap_or(8787);
    let token = std::env::var("AGENT_TOKEN").unwrap_or_default();
    let allowed_roots = parse_roots(std::env::var("AGENT_ALLOWED_ROOTS").ok());
    let provider = ProviderKind::from_env(std::env::var("AGENT_PROVIDER").ok());
    let codex_cmd = std::env::var("CODEX_CMD").unwrap_or_else(|_| "codex".to_string());
    let codex_login_args = std::env::var("CODEX_LOGIN_ARGS")
      .map(split_args)
      .unwrap_or_else(|_| vec!["auth".to_string(), "login".to_string()]);
    let codex_app_server_args = std::env::var("CODEX_APP_SERVER_ARGS")
      .map(split_args)
      .unwrap_or_else(|_| vec!["app-server".to_string()]);
    let codex_model = std::env::var("CODEX_MODEL").ok().filter(|value| !value.is_empty());
    let gemini_cmd = std::env::var("GEMINI_CMD").unwrap_or_else(|_| "gemini".to_string());
    let gemini_args = std::env::var("GEMINI_ARGS").map(split_args).unwrap_or_default();
    let gemini_model = std::env::var("GEMINI_MODEL").ok().filter(|value| !value.is_empty());
    let gemini_models = std::env::var("GEMINI_MODELS").ok().map(split_list).unwrap_or_default();
    let gemini_approval_mode = std::env::var("GEMINI_APPROVAL_MODE").unwrap_or_else(|_| "yolo".to_string());
    let gemini_sandbox = parse_bool(std::env::var("GEMINI_SANDBOX").ok(), true);
    let gemini_login_prompt = std::env::var("GEMINI_LOGIN_PROMPT").ok().filter(|value| !value.is_empty());
    let auto_login = parse_bool(std::env::var("AGENT_AUTO_LOGIN").ok(), false);
    let default_ui = PathBuf::from("../ui");
    let ui_dir = std::env::var("AGENT_UI_DIR")
      .ok()
      .filter(|value| !value.is_empty())
      .map(PathBuf::from)
      .unwrap_or(default_ui);
    let ui_dir = normalize_path(&ui_dir, &std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    let cancel_grace_ms = std::env::var("AGENT_CANCEL_GRACE_MS").ok().and_then(|value| value.parse().ok()).unwrap_or(4000);
    let task_ttl_ms = std::env::var("AGENT_TASK_TTL_MS").ok().and_then(|value| value.parse().ok()).unwrap_or(120000);
    let log_path = std::env::var("AGENT_LOG_PATH").ok().filter(|value| !value.is_empty()).map(PathBuf::from);

    Self {
      host,
      port,
      token,
      allowed_roots,
      provider,
      codex_cmd,
      codex_login_args,
      codex_app_server_args,
      codex_model,
      gemini_cmd,
      gemini_args,
      gemini_model,
      gemini_models,
      gemini_approval_mode,
      gemini_sandbox,
      gemini_login_prompt,
      auto_login,
      ui_dir: Some(ui_dir),
      cancel_grace_ms,
      task_ttl_ms,
      log_path,
    }
  }
}

fn parse_bool(raw: Option<String>, default_value: bool) -> bool {
  match raw {
    Some(value) => {
      let normalized = value.trim().to_ascii_lowercase();
      matches!(normalized.as_str(), "1" | "true" | "yes" | "on")
    }
    None => default_value,
  }
}

fn parse_roots(raw: Option<String>) -> Vec<PathBuf> {
  let roots = raw
    .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")).to_string_lossy().to_string())
    .split(|ch| ch == ',' || ch == ';' || ch == ':')
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(PathBuf::from)
    .collect::<Vec<_>>();

  roots
    .into_iter()
    .map(|path| normalize_path(&path, &std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))))
    .collect()
}

fn split_args(raw: String) -> Vec<String> {
  raw.split_whitespace().map(|s| s.to_string()).collect()
}

fn split_list(raw: String) -> Vec<String> {
  raw
    .split(|ch: char| ch == ',' || ch == ';' || ch.is_whitespace())
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(|value| value.to_string())
    .collect()
}

fn gemini_model_ids(config: &Config) -> Vec<String> {
  let mut result = vec!["auto".to_string()];
  for model in config.gemini_models.iter().cloned() {
    if !result.iter().any(|existing| existing.eq_ignore_ascii_case(&model)) {
      result.push(model);
    }
  }
  if let Some(model) = config.gemini_model.as_ref().map(|m| m.trim()).filter(|m| !m.is_empty()) {
    if !result.iter().any(|existing| existing.eq_ignore_ascii_case(model)) {
      result.push(model.to_string());
    }
  }
  result
}

fn resolve_provider_and_model(default_provider: ProviderKind, model: Option<&str>) -> (ProviderKind, Option<String>) {
  let model = model.map(str::trim).filter(|value| !value.is_empty());
  let Some(model) = model else {
    return (default_provider, None);
  };

  // For multi-provider mode, we support explicit routing via a `provider:model` prefix.
  // If no prefix is present, treat the model id as Codex/OpenAI-style and route to Codex.
  if model.len() >= 7 && model[..7].eq_ignore_ascii_case("gemini:") {
    let rest = model[7..].trim();
    return (ProviderKind::Gemini, (!rest.is_empty()).then(|| rest.to_string()));
  }
  if model.len() >= 6 && model[..6].eq_ignore_ascii_case("codex:") {
    let rest = model[6..].trim();
    return (ProviderKind::Codex, (!rest.is_empty()).then(|| rest.to_string()));
  }

  (ProviderKind::Codex, Some(model.to_string()))
}

impl CodexAppServer {
  async fn start(config: Arc<Config>) -> Result<Arc<Self>, String> {
    let mut command = Command::new(&config.codex_cmd);
    command
      .args(config.codex_app_server_args.clone())
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|err| format!("failed to spawn codex app-server: {err}"))?;
    let stdin = child.stdin.take().ok_or("codex app-server stdin unavailable")?;
    let stdout = child.stdout.take().ok_or("codex app-server stdout unavailable")?;
    let stderr = child.stderr.take();

    let (events_tx, _) = broadcast::channel(128);
    let pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>> = Mutex::new(HashMap::new());
    let server = Arc::new(CodexAppServer {
      stdin: Mutex::new(stdin),
      pending,
      events: events_tx,
      next_id: AtomicU64::new(1),
      run_lock: Mutex::new(()),
      model_override: config.codex_model.clone(),
    });

    let server_for_read = server.clone();
    tokio::spawn(async move {
      let mut reader = tokio::io::BufReader::new(stdout);
      let mut line = String::new();
      loop {
        line.clear();
        let bytes = match reader.read_line(&mut line).await {
          Ok(0) => break,
          Ok(n) => n,
          Err(_) => break,
        };
        if bytes == 0 {
          break;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
          continue;
        }
        let parsed: Value = match serde_json::from_str(trimmed) {
          Ok(value) => value,
          Err(_) => continue,
        };
        if let Some(id) = parsed.get("id").and_then(|v| v.as_u64()) {
          if parsed.get("method").is_some() {
            let _ = server_for_read.handle_server_request(id, &parsed).await;
          } else {
            let tx = {
              let mut pending = server_for_read.pending.lock().await;
              pending.remove(&id)
            };
            if let Some(tx) = tx {
              if let Some(error) = parsed.get("error") {
                let _ = tx.send(Err(error.to_string()));
              } else {
                let result = parsed.get("result").cloned().unwrap_or(Value::Null);
                let _ = tx.send(Ok(result));
              }
            }
          }
        } else if parsed.get("method").is_some() {
          let _ = server_for_read.events.send(parsed);
        }
      }
    });

    if let Some(stderr) = stderr {
      tokio::spawn(async move {
        let mut reader = tokio::io::BufReader::new(stderr);
        let mut line = String::new();
        loop {
          line.clear();
          let bytes = match reader.read_line(&mut line).await {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
          };
          if bytes == 0 {
            break;
          }
          if !line.trim().is_empty() {
            eprintln!("[codex app-server] {line}");
          }
        }
      });
    }

    server.send_request("initialize", json!({
      "clientInfo": {
        "name": "mermaid-agent",
        "version": "0.1.0"
      }
    })).await?;
    server.send_notification("initialized", json!({})).await?;

    Ok(server)
  }

  async fn send_request(&self, method: &str, params: Value) -> Result<Value, String> {
    let id = self.next_id.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = oneshot::channel();
    {
      let mut pending = self.pending.lock().await;
      pending.insert(id, tx);
    }
    let payload = json!({
      "id": id,
      "method": method,
      "params": params
    });
    let mut stdin = self.stdin.lock().await;
    stdin.write_all(payload.to_string().as_bytes()).await.map_err(|err| err.to_string())?;
    stdin.write_all(b"\n").await.map_err(|err| err.to_string())?;
    rx.await.map_err(|err| err.to_string())?
  }

  async fn send_response(&self, id: u64, result: Value) -> Result<(), String> {
    let payload = json!({
      "id": id,
      "result": result
    });
    let mut stdin = self.stdin.lock().await;
    stdin.write_all(payload.to_string().as_bytes()).await.map_err(|err| err.to_string())?;
    stdin.write_all(b"\n").await.map_err(|err| err.to_string())?;
    Ok(())
  }

  async fn handle_server_request(&self, id: u64, payload: &Value) -> Result<(), String> {
    let method = payload.get("method").and_then(|v| v.as_str()).unwrap_or("");
    if method.contains("requestApproval") {
      return self.send_response(id, json!({ "decision": "accept" })).await;
    }
    self.send_response(id, json!({})).await
  }

  async fn send_notification(&self, method: &str, params: Value) -> Result<(), String> {
    let payload = json!({
      "method": method,
      "params": params
    });
    let mut stdin = self.stdin.lock().await;
    stdin.write_all(payload.to_string().as_bytes()).await.map_err(|err| err.to_string())?;
    stdin.write_all(b"\n").await.map_err(|err| err.to_string())?;
    Ok(())
  }

  async fn login_chatgpt(&self) -> Result<Value, String> {
    let _guard = self.run_lock.lock().await;
    let response = tokio::time::timeout(
      Duration::from_secs(10),
      self.send_request("account/login/start", json!({ "type": "chatgpt" })),
    )
    .await
    .map_err(|_| "login start timed out".to_string())??;
    if let Some(url) = response.get("verificationUri").and_then(|value| value.as_str()) {
      let _ = open::that(url);
    }
    Ok(response)
  }

  async fn list_models(&self) -> Result<Vec<ModelInfo>, String> {
    let _guard = self.run_lock.lock().await;
    let response = self.send_request("model/list", json!({})).await?;
    let models = response.get("models").or_else(|| response.get("data")).and_then(|value| value.as_array()).cloned().unwrap_or_default();
    let now = now_unix();
    let mut result = Vec::new();
    for item in models {
      let (id, name) = if let Some(id) = item.as_str() {
        (id.to_string(), id.to_string())
      } else {
        let id = item.get("id").or_else(|| item.get("name")).and_then(|v| v.as_str()).unwrap_or("codex").to_string();
        let name = item.get("name").and_then(|v| v.as_str()).unwrap_or(&id).to_string();
        (id, name)
      };
      let owned_by = item.get("owned_by").or_else(|| item.get("ownedBy")).and_then(|v| v.as_str()).unwrap_or("openai").to_string();
      let created = item.get("created").and_then(|v| v.as_u64()).unwrap_or(now);
      let context_length = item
        .get("context_length")
        .or_else(|| item.get("contextLength"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
      let context_length = u32::try_from(context_length).unwrap_or(u32::MAX);
      result.push(ModelInfo {
        id,
        object: "model".to_string(),
        created,
        owned_by,
        name,
        context_length,
      });
    }
    Ok(result)
  }

  async fn run_chat_stream(
    &self,
    prompt: String,
    delta_sender: Option<broadcast::Sender<TaskEvent>>,
    requested_model: Option<String>,
  ) -> Result<(String, String, Option<String>, Option<String>), String> {
    let _guard = self.run_lock.lock().await;
    let listed_models = self.send_request("model/list", json!({})).await.ok().and_then(|value| {
      value.get("models")
        .or_else(|| value.get("data"))
        .and_then(|models| models.as_array())
        .map(|models| {
          models.iter().filter_map(|item| {
            if let Some(id) = item.as_str() {
              Some(id.to_string())
            } else {
              item.get("id").and_then(|id| id.as_str()).map(|id| id.to_string())
            }
          }).collect::<Vec<String>>()
        })
    });

    let requested_model = requested_model
      .map(|value| value.trim().to_string())
      .filter(|value| !value.is_empty());
    let model_override = self.model_override.clone();

    let fallback = || {
      model_override.clone().or_else(|| {
        listed_models.as_ref().and_then(|models| {
          models.iter().find(|id| id.as_str() != "codex").cloned().or_else(|| models.first().cloned())
        })
      }).unwrap_or_else(|| "codex".to_string())
    };

    let model_id = if let Some(requested) = requested_model {
      match listed_models.as_ref() {
        Some(models) if !models.is_empty() => {
          if models.iter().any(|id| id == &requested) {
            requested
          } else {
            fallback()
          }
        }
        _ => requested,
      }
    } else {
      fallback()
    };

    let thread = self.send_request("thread/start", json!({
      "model": model_id,
      "approvalPolicy": "never"
    })).await?;
    let thread_id = thread.pointer("/thread/id").and_then(|v| v.as_str()).ok_or("missing thread id")?.to_string();

    let turn = self.send_request("turn/start", json!({
      "threadId": thread_id,
      "approvalPolicy": "never",
      "input": [{ "type": "text", "text": prompt }]
    })).await?;
    let turn_id = turn.pointer("/turn/id").and_then(|v| v.as_str()).ok_or("missing turn id")?.to_string();

    let mut output = String::new();
    let mut error_message: Option<String> = None;
    let mut rx = self.events.subscribe();

    let status = loop {
      let event = tokio::time::timeout(Duration::from_secs(60), rx.recv())
        .await
        .map_err(|_| "timeout waiting for codex events".to_string())?
        .map_err(|err| err.to_string())?;
      let method = event.get("method").and_then(|v| v.as_str()).unwrap_or("");
      let params = event.get("params");
      match method {
        "item/agentMessage/delta" => {
          let delta = params.and_then(|p| p.get("delta")).and_then(|v| v.as_str()).unwrap_or("");
          if !delta.is_empty() {
            output.push_str(delta);
            if let Some(sender) = delta_sender.as_ref() {
              let _ = sender.send(TaskEvent::Stdout(delta.to_string()));
            }
          }
        }
        "turn/completed" => {
          let completed_id = params
            .and_then(|p| p.get("turn"))
            .and_then(|t| t.get("id"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
          if completed_id == turn_id {
            break params
              .and_then(|p| p.get("turn"))
              .and_then(|t| t.get("status"))
              .and_then(|v| v.as_str())
              .unwrap_or("completed")
              .to_string();
          }
        }
        "error" => {
          if error_message.is_none() {
            let message = params
              .and_then(|p| p.get("error"))
              .and_then(|e| e.get("message"))
              .and_then(|v| v.as_str())
              .map(|v| v.to_string());
            if let Some(message) = message {
              error_message = Some(message.clone());
              if let Some(sender) = delta_sender.as_ref() {
                let _ = sender.send(TaskEvent::Stderr(message));
              }
            }
          }
        }
        _ => {}
      }
    };

    Ok((output, status, error_message, Some(model_id)))
  }
}

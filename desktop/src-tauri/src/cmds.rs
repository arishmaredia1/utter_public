use serde::{Deserialize, Serialize};
use bson::DateTime as BsonDateTime;
use chrono::Utc;

use crate::env::EnvConfig;
use crate::errors::{AppError, AppResult};
use crate::groq;
use crate::mongo::{self, RecentRecording, RecordingDoc, ChatMessageDoc};
use crate::state::AppState;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct LoginResult { pub token: String }

#[tauri::command]
pub async fn login(state: State<'_, AppState>, username: String, password: String) -> AppResult<LoginResult> {
    let env = EnvConfig::load()?;
    let user_ok = constant_time_eq::constant_time_eq(username.as_bytes(), env.admin_username.as_bytes());
    let pass_ok = constant_time_eq::constant_time_eq(password.as_bytes(), env.admin_password.as_bytes());
    if !(user_ok && pass_ok) { return Err(AppError::Unauthorized); }
    let token = state.issue_session();
    Ok(LoginResult { token })
}

#[tauri::command]
pub fn logout(state: State<'_, AppState>) {
    state.clear();
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicSecrets {
    pub b2_region: String,
    pub r2_access_key_id: String,
    pub r2_secret_access_key: String,
    pub r2_bucket: String,
    pub web_app_url: String,
}

#[tauri::command]
pub fn get_secrets(state: State<'_, AppState>, session: String) -> AppResult<PublicSecrets> {
    if !state.validate(&session) { return Err(AppError::Unauthorized); }
    let env = EnvConfig::load()?;
    Ok(PublicSecrets {
        b2_region: env.b2_region,
        r2_access_key_id: env.r2_access_key_id,
        r2_secret_access_key: env.r2_secret_access_key,
        r2_bucket: env.r2_bucket,
        web_app_url: env.web_app_url,
    })
}

#[tauri::command]
pub async fn list_recent(state: State<'_, AppState>, session: String) -> AppResult<Vec<RecentRecording>> {
    if !state.validate(&session) { return Err(AppError::Unauthorized); }
    mongo::list_recent(10).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterPayload {
    pub title: String,
    pub r2_key: String,
    pub duration_ms: i64,
    pub size_bytes: i64,
    pub mime_type: Option<String>,
}

#[tauri::command]
pub async fn register_recording(state: State<'_, AppState>, session: String, payload: RegisterPayload) -> AppResult<String> {
    if !state.validate(&session) { return Err(AppError::Unauthorized); }
    let env = EnvConfig::load()?;
    let now = Utc::now();
    let doc = RecordingDoc {
        id: None,
        title: payload.title,
        created_at: BsonDateTime::from_millis(now.timestamp_millis()),
        duration_ms: payload.duration_ms,
        size_bytes: payload.size_bytes,
        status: "transcribing".to_string(),
        r2_key: payload.r2_key,
        r2_bucket: env.r2_bucket,
        mime_type: payload.mime_type.unwrap_or_else(|| "video/webm".to_string()),
        transcript: None,
        chats: Vec::<ChatMessageDoc>::new(),
        share_token: None,
        failure_reason: None,
    };
    mongo::insert_recording(doc).await
}

#[tauri::command]
pub async fn transcribe_recording(state: State<'_, AppState>, session: String, recording_id: String, r2_key: String) -> AppResult<()> {
    if !state.validate(&session) { return Err(AppError::Unauthorized); }
    match groq::transcribe_from_r2(&r2_key).await {
        Ok(t) => mongo::set_transcript(&recording_id, t).await,
        Err(e) => {
            let msg = format!("{e}");
            let _ = mongo::set_failure(&recording_id, &msg).await;
            Err(e)
        }
    }
}

use crate::audio_setup::{self, BlackHoleStatus};

#[tauri::command]
pub fn audio_check_blackhole() -> BlackHoleStatus {
    audio_setup::check_status()
}

#[tauri::command]
pub async fn audio_install_blackhole(state: State<'_, AppState>, session: String) -> AppResult<()> {
    if !state.validate(&session) { return Err(AppError::Unauthorized); }
    audio_setup::install().await
}

use crate::permissions;

#[tauri::command]
pub fn permissions_check() -> permissions::PermissionStatus {
    permissions::check()
}

#[tauri::command]
pub fn permissions_request_screen() -> bool {
    permissions::request_screen()
}

#[tauri::command]
pub fn permissions_open_screen_settings() -> AppResult<()> {
    permissions::open_screen_settings().map_err(|e| AppError::Other(e.to_string()))
}

#[tauri::command]
pub fn app_relaunch(app: tauri::AppHandle) {
    app.restart();
}

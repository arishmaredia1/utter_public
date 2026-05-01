use reqwest::multipart;
use serde::Deserialize;

use crate::errors::{AppError, AppResult};
use crate::env::EnvConfig;
use crate::mongo::{TranscriptDoc, TranscriptSegment};

#[derive(Debug, Deserialize)]
struct GroqResponse {
    text: String,
    language: String,
    segments: Option<Vec<GroqSegment>>,
}

#[derive(Debug, Deserialize)]
struct GroqSegment {
    start: f64,
    end: f64,
    text: String,
}

/// Transcribe a webm audio/video file by re-fetching it from R2 and POSTing to Groq.
pub async fn transcribe_from_r2(r2_key: &str) -> AppResult<TranscriptDoc> {
    let env = EnvConfig::load()?;
    let bytes = sign_and_get(&env, r2_key).await?;

    let part = multipart::Part::bytes(bytes).file_name("audio.webm").mime_str("video/webm")?;
    let form = multipart::Form::new()
        .part("file", part)
        .text("model", "whisper-large-v3")
        .text("response_format", "verbose_json")
        .text("temperature", "0");

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.groq.com/openai/v1/audio/transcriptions")
        .bearer_auth(&env.groq_api_key)
        .multipart(form)
        .send()
        .await?;
    if !resp.status().is_success() {
        let s = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Other(format!("groq {s}: {body}")));
    }
    let payload: GroqResponse = resp.json().await?;
    let segments = payload.segments.unwrap_or_default().into_iter()
        .map(|s| TranscriptSegment { start: s.start, end: s.end, text: s.text.trim().to_string() })
        .collect();
    Ok(TranscriptDoc {
        segments,
        full_text: payload.text,
        language: payload.language,
        model: "whisper-large-v3".to_string(),
    })
}

async fn sign_and_get(env: &EnvConfig, key: &str) -> AppResult<Vec<u8>> {
    use aws_credential_types::Credentials;
    use aws_sdk_s3::{config::Builder, Client};

    let creds = Credentials::new(
        &env.r2_access_key_id,
        &env.r2_secret_access_key,
        None, None, "utter-desktop",
    );
    let conf = Builder::new()
        .region(aws_sdk_s3::config::Region::new("auto"))
        .endpoint_url(format!("https://{}.r2.cloudflarestorage.com", env.r2_account_id))
        .credentials_provider(creds)
        .behavior_version_latest()
        .build();
    let client = Client::from_conf(conf);

    let resp = client.get_object()
        .bucket(&env.r2_bucket)
        .key(key)
        .send().await
        .map_err(|e| AppError::Other(e.to_string()))?;
    let bytes = resp.body.collect().await
        .map_err(|e| AppError::Other(e.to_string()))?
        .into_bytes();
    Ok(bytes.to_vec())
}

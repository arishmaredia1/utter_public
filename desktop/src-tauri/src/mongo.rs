use std::sync::Arc;
use mongodb::{Client, Database, options::ClientOptions};
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use bson::{oid::ObjectId, DateTime as BsonDateTime};

use crate::errors::{AppError, AppResult};
use crate::env::EnvConfig;

/// Used when MONGODB_URI doesn't include a database name in the path
/// (common for Atlas connection strings that end with `?retryWrites=...`).
const DEFAULT_DB_NAME: &str = "utter";

static CLIENT: OnceCell<Arc<Client>> = OnceCell::new();

async fn ensure_client(uri: &str) -> AppResult<Arc<Client>> {
    if let Some(c) = CLIENT.get() { return Ok(c.clone()); }
    let opts = ClientOptions::parse(uri).await?;
    let client = Arc::new(Client::with_options(opts)?);
    let _ = CLIENT.set(client.clone());
    Ok(client)
}

pub async fn db() -> AppResult<Database> {
    let env = EnvConfig::load()?;
    let client = ensure_client(&env.mongodb_uri).await?;
    // Prefer the db name embedded in the URI, but fall back to "utter" so Atlas
    // strings (which typically have no path component) just work.
    Ok(client
        .default_database()
        .unwrap_or_else(|| client.database(DEFAULT_DB_NAME)))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TranscriptSegment {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TranscriptDoc {
    pub segments: Vec<TranscriptSegment>,
    #[serde(rename = "fullText")]
    pub full_text: String,
    pub language: String,
    pub model: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageDoc {
    pub role: String,
    pub content: String,
    pub created_at: BsonDateTime,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecordingDoc {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub title: String,
    pub created_at: BsonDateTime,
    pub duration_ms: i64,
    pub size_bytes: i64,
    pub status: String, // "uploading" | "transcribing" | "ready" | "failed"
    pub r2_key: String,
    pub r2_bucket: String,
    pub mime_type: String,
    pub transcript: Option<TranscriptDoc>,
    pub chats: Vec<ChatMessageDoc>,
    pub share_token: Option<String>,
    pub failure_reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentRecording {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub duration_ms: i64,
    pub status: String,
}

pub async fn list_recent(limit: i64) -> AppResult<Vec<RecentRecording>> {
    use futures_util::TryStreamExt;
    use mongodb::options::FindOptions;
    let coll = db().await?.collection::<RecordingDoc>("recordings");
    let opts = FindOptions::builder()
        .sort(bson::doc! { "createdAt": -1 })
        .limit(limit)
        .build();
    let mut cursor = coll.find(bson::doc! {}).with_options(opts).await?;
    let mut out = Vec::new();
    while let Some(doc) = cursor.try_next().await? {
        out.push(RecentRecording {
            id: doc.id.map(|o| o.to_hex()).unwrap_or_default(),
            title: doc.title,
            created_at: doc.created_at.try_to_rfc3339_string().unwrap_or_default(),
            duration_ms: doc.duration_ms,
            status: doc.status,
        });
    }
    Ok(out)
}

pub async fn insert_recording(doc: RecordingDoc) -> AppResult<String> {
    let coll = db().await?.collection::<RecordingDoc>("recordings");
    let res = coll.insert_one(doc).await?;
    let id = res.inserted_id.as_object_id().ok_or_else(|| AppError::Other("inserted_id not ObjectId".into()))?;
    Ok(id.to_hex())
}

pub async fn set_transcript(recording_id: &str, transcript: TranscriptDoc) -> AppResult<()> {
    let oid = ObjectId::parse_str(recording_id).map_err(|e| AppError::Other(format!("bad id: {e}")))?;
    let coll = db().await?.collection::<RecordingDoc>("recordings");
    let t = bson::to_bson(&transcript)?;
    coll.update_one(
        bson::doc! { "_id": oid },
        bson::doc! { "$set": { "transcript": t, "status": "ready" } },
    ).await?;
    Ok(())
}

pub async fn set_failure(recording_id: &str, reason: &str) -> AppResult<()> {
    let oid = ObjectId::parse_str(recording_id).map_err(|e| AppError::Other(format!("bad id: {e}")))?;
    let coll = db().await?.collection::<RecordingDoc>("recordings");
    coll.update_one(
        bson::doc! { "_id": oid },
        bson::doc! { "$set": { "status": "failed", "failureReason": reason } },
    ).await?;
    Ok(())
}

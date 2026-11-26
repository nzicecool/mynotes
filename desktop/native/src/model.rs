use crate::{Result, VaultError};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub(crate) const MAX_NOTE_BYTES: usize = 2 * 1024 * 1024;
pub(crate) const MAX_NOTES: usize = 10_000;
pub(crate) const MAX_BACKUP_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub note_type: String,
    pub tags: Vec<String>,
    pub pinned: bool,
    pub archived: bool,
    pub trashed: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteInput {
    #[serde(default)]
    pub id: Option<String>,
    pub title: String,
    pub content: String,
    pub note_type: String,
    pub tags: Vec<String>,
    pub pinned: bool,
    pub archived: bool,
    pub trashed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VaultStatus {
    pub initialized: bool,
    pub unlocked: bool,
    pub recovery_codes_remaining: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RecoveryResult {
    pub codes: Vec<String>,
}

pub(crate) fn valid_id(id: &str) -> bool {
    Uuid::parse_str(id)
        .map(|v| v.to_string() == id)
        .unwrap_or(false)
}

pub(crate) fn validate_fields(
    title: &str,
    content: &str,
    kind: &str,
    tags: &[String],
) -> Result<()> {
    if !matches!(
        kind,
        "plain" | "rich" | "markdown" | "checklist" | "code" | "spreadsheet"
    ) {
        return Err(VaultError::InvalidInput);
    }
    if title.len() > 16 * 1024
        || content.len() > MAX_NOTE_BYTES
        || tags.len() > 128
        || tags.iter().any(|tag| tag.len() > 256)
    {
        return Err(VaultError::LimitExceeded);
    }
    Ok(())
}

impl Note {
    pub(crate) fn validate(&self) -> Result<()> {
        if !valid_id(&self.id)
            || self.created_at < 0
            || self.updated_at < self.created_at
            || self.updated_at > 9_007_199_254_740_991
        {
            return Err(VaultError::InvalidInput);
        }
        validate_fields(&self.title, &self.content, &self.note_type, &self.tags)?;
        if serde_json::to_vec(self)
            .map_err(|_| VaultError::InvalidInput)?
            .len()
            > MAX_NOTE_BYTES
        {
            return Err(VaultError::LimitExceeded);
        }
        Ok(())
    }
}

pub(crate) fn now() -> Result<i64> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| VaultError::Storage)?
        .as_millis();
    i64::try_from(millis).map_err(|_| VaultError::Storage)
}

pub(crate) fn validate_pin(pin: &str) -> Result<()> {
    // A finite upper bound also prevents attacker-controlled KDF input allocation.
    if !(6..=128).contains(&pin.len()) || !pin.bytes().all(|b| b.is_ascii_digit()) {
        return Err(VaultError::InvalidPin);
    }
    Ok(())
}

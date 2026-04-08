use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};

static PENDING_AUTH_STATE: OnceLock<Mutex<Option<String>>> = OnceLock::new();

#[derive(Debug, Serialize, Deserialize)]
struct StoredTokens {
    access_token: String,
    refresh_token: String,
}

#[derive(Debug)]
pub enum TokenError {
    State(String),
    Store(String),
    NotFound,
}

impl std::fmt::Display for TokenError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TokenError::State(message) => write!(f, "{message}"),
            TokenError::Store(message) => write!(f, "{message}"),
            TokenError::NotFound => write!(f, "token not found"),
        }
    }
}

impl std::error::Error for TokenError {}

pub fn store_pending_state(state: &str) {
    let mut guard = pending_state()
        .lock()
        .unwrap_or_else(|err| err.into_inner());
    *guard = Some(state.to_string());
}

pub fn validate_auth_state(received_state: &str) -> bool {
    let mut guard = pending_state()
        .lock()
        .unwrap_or_else(|err| err.into_inner());
    let expected = guard.take();
    expected.as_deref() == Some(received_state)
}

pub fn store_tokens(access_token: &str, refresh_token: &str) -> Result<(), TokenError> {
    let tokens = StoredTokens {
        access_token: access_token.to_string(),
        refresh_token: refresh_token.to_string(),
    };
    let path = auth_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| TokenError::Store(err.to_string()))?;
    }
    let content =
        serde_json::to_vec_pretty(&tokens).map_err(|err| TokenError::Store(err.to_string()))?;
    fs::write(path, content).map_err(|err| TokenError::Store(err.to_string()))
}

pub fn get_access_token() -> Result<String, TokenError> {
    let tokens = read_tokens()?;
    if tokens.access_token.is_empty() {
        return Err(TokenError::NotFound);
    }
    Ok(tokens.access_token)
}

pub fn clear_tokens() -> Result<(), TokenError> {
    let path = auth_path()?;
    if !path.exists() {
        return Ok(());
    }
    fs::remove_file(path).map_err(|err| TokenError::Store(err.to_string()))
}

fn pending_state() -> &'static Mutex<Option<String>> {
    PENDING_AUTH_STATE.get_or_init(|| Mutex::new(None))
}

fn read_tokens() -> Result<StoredTokens, TokenError> {
    let path = auth_path()?;
    if !path.exists() {
        return Err(TokenError::NotFound);
    }
    let content = fs::read(path).map_err(|err| TokenError::Store(err.to_string()))?;
    serde_json::from_slice(&content).map_err(|err| TokenError::Store(err.to_string()))
}

fn auth_path() -> Result<PathBuf, TokenError> {
    let home = dirs::home_dir()
        .ok_or_else(|| TokenError::State("cannot resolve the user home directory".to_string()))?;
    Ok(home.join(".kuku").join("auth.json"))
}

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, command};
use tauri_plugin_opener::OpenerExt;

use crate::{auth, config};

const DEV_CALLBACK_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    pub email: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopAuthURLResponse {
    auth_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExchangeDesktopTokenResponse {
    #[serde(alias = "access_token")]
    access_token: String,
    #[serde(alias = "refresh_token")]
    refresh_token: String,
}

#[command]
pub fn auth_check_status() -> Result<bool, String> {
    match auth::get_access_token() {
        Ok(_) => Ok(true),
        Err(auth::TokenError::NotFound) => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

#[command]
pub fn auth_get_access_token() -> Result<String, String> {
    auth::get_access_token().map_err(|error| error.to_string())
}

#[command]
pub fn auth_get_user() -> Result<Option<User>, String> {
    let token = match auth::get_access_token() {
        Ok(token) => token,
        Err(auth::TokenError::NotFound) => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };

    let payload = token
        .split('.')
        .nth(1)
        .ok_or_else(|| "invalid JWT format".to_string())?;
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|error| format!("failed to decode JWT payload: {error}"))?;
    let claims: serde_json::Value = serde_json::from_slice(&decoded)
        .map_err(|error| format!("failed to parse JWT claims: {error}"))?;
    let email = claims
        .get("email")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "email not found in JWT claims".to_string())?
        .to_string();

    Ok(Some(User { email }))
}

#[command]
pub fn auth_logout() -> Result<(), String> {
    auth::clear_tokens().map_err(|error| error.to_string())
}

#[command]
pub async fn auth_open_login(app: AppHandle) -> Result<(), String> {
    let mut auth_url = request_desktop_auth_url().await?;
    let state = extract_query_param(&auth_url, "state")
        .ok_or_else(|| "desktop auth URL did not include state".to_string())?;
    auth::store_pending_state(&state);

    if cfg!(debug_assertions) {
        if let Some(callback_url) = start_dev_callback_server(app.clone()) {
            auth_url = append_query_param(&auth_url, "desktop_callback", &callback_url);
        }
    }

    app.opener()
        .open_url(&auth_url, None::<String>)
        .map_err(|error| format!("failed to open login page: {error}"))
}

pub async fn handle_auth_deep_link(app: &AppHandle, token: &str, state: &str) {
    if !auth::validate_auth_state(state) {
        emit_auth_error(app, "Authentication failed: invalid state");
        return;
    }

    match exchange_desktop_token(token, state).await {
        Ok(response) => {
            if let Err(error) = auth::store_tokens(&response.access_token, &response.refresh_token)
            {
                emit_auth_error(
                    app,
                    &format!("Failed to store authentication tokens: {error}"),
                );
                return;
            }
            let _ = app.emit(
                "auth://success",
                serde_json::json!({ "message": "Authentication successful" }),
            );
        }
        Err(error) => emit_auth_error(app, &format!("Authentication failed: {error}")),
    }
}

fn emit_auth_error(app: &AppHandle, message: &str) {
    let _ = app.emit("auth://error", serde_json::json!({ "message": message }));
}

fn start_dev_callback_server(app: AppHandle) -> Option<String> {
    let listener = match TcpListener::bind("127.0.0.1:0") {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("desktop auth dev callback bind failed: {error}");
            return None;
        }
    };
    let callback_url = match listener.local_addr() {
        Ok(address) => format!("http://{address}/auth"),
        Err(error) => {
            eprintln!("desktop auth dev callback address lookup failed: {error}");
            return None;
        }
    };
    thread::spawn(move || {
        if let Err(error) = run_dev_callback_server(app, listener) {
            eprintln!("desktop auth dev callback failed: {error}");
        }
    });
    Some(callback_url)
}

fn run_dev_callback_server(app: AppHandle, listener: TcpListener) -> Result<(), String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("failed to configure auth callback listener: {error}"))?;

    let deadline = Instant::now() + DEV_CALLBACK_TIMEOUT;
    loop {
        match listener.accept() {
            Ok((mut stream, _)) => return handle_dev_callback_request(&app, &mut stream),
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return Err("timed out waiting for desktop auth callback".to_string());
                }
                thread::sleep(Duration::from_millis(100));
            }
            Err(error) => return Err(format!("failed to accept desktop auth callback: {error}")),
        }
    }
}

fn handle_dev_callback_request(app: &AppHandle, stream: &mut TcpStream) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| format!("failed to configure auth callback stream: {error}"))?;

    let mut buffer = [0_u8; 4096];
    let len = stream
        .read(&mut buffer)
        .map_err(|error| format!("failed to read desktop auth callback: {error}"))?;
    let request = String::from_utf8_lossy(&buffer[..len]);
    let request_line = request.lines().next().unwrap_or_default();
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let target = parts.next().unwrap_or_default();

    if method != "GET" {
        return write_http_response(stream, "405 Method Not Allowed", "Unsupported method.");
    }

    let token = extract_query_param(target, "token");
    let state = extract_query_param(target, "state");
    let Some((token, state)) = token.zip(state) else {
        return write_http_response(stream, "400 Bad Request", "Missing authentication token.");
    };

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        handle_auth_deep_link(&app_handle, &token, &state).await;
    });

    write_http_response(
        stream,
        "200 OK",
        "Authentication complete. You can return to Kuku.",
    )
}

fn write_http_response(stream: &mut TcpStream, status: &str, body: &str) -> Result<(), String> {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream
        .write_all(response.as_bytes())
        .map_err(|error| format!("failed to write desktop auth callback response: {error}"))
}

async fn request_desktop_auth_url() -> Result<String, String> {
    let endpoint = format!(
        "{}/kuku.auth.v1.AuthService/DesktopAuthURL",
        config::api_url().trim_end_matches('/')
    );
    let response = reqwest::Client::new()
        .post(endpoint)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|error| format!("failed to request desktop auth URL: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("server returned {}", response.status()));
    }

    let body = response
        .json::<DesktopAuthURLResponse>()
        .await
        .map_err(|error| format!("failed to decode desktop auth URL: {error}"))?;
    Ok(body.auth_url)
}

async fn exchange_desktop_token(
    token: &str,
    state: &str,
) -> Result<ExchangeDesktopTokenResponse, String> {
    let endpoint = format!(
        "{}/kuku.auth.v1.AuthService/ExchangeDesktopToken",
        config::api_url().trim_end_matches('/')
    );
    let response = reqwest::Client::new()
        .post(endpoint)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "token": token, "state": state }))
        .send()
        .await
        .map_err(|error| format!("failed to exchange desktop token: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("server returned {}", response.status()));
    }

    response
        .json::<ExchangeDesktopTokenResponse>()
        .await
        .map_err(|error| format!("failed to decode desktop token response: {error}"))
}

fn extract_query_param(input: &str, key: &str) -> Option<String> {
    let (_, raw_query) = input.split_once('?')?;
    let query = raw_query
        .split_once('#')
        .map_or(raw_query, |(query, _)| query);
    for pair in query.split('&') {
        let (name, value) = pair.split_once('=').unwrap_or((pair, ""));
        if name == key {
            return Some(percent_decode(value));
        }
    }
    None
}

fn append_query_param(input: &str, key: &str, value: &str) -> String {
    let (base, fragment) = input
        .split_once('#')
        .map_or((input, None), |(base, fragment)| (base, Some(fragment)));
    let separator = if base.contains('?') { "&" } else { "?" };
    let mut output = format!("{base}{separator}{key}={}", percent_encode(value));
    if let Some(fragment) = fragment {
        output.push('#');
        output.push_str(fragment);
    }
    output
}

fn percent_encode(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    for byte in input.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            output.push(char::from(byte));
        } else {
            output.push_str(&format!("%{byte:02X}"));
        }
    }
    output
}

fn percent_decode(input: &str) -> String {
    let input = input.replace('+', " ");
    let mut output = Vec::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = &input[index + 1..index + 3];
            if let Ok(value) = u8::from_str_radix(hex, 16) {
                output.push(value);
                index += 3;
                continue;
            }
        }
        output.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&output).into_owned()
}

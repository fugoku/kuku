use std::{fs, path::PathBuf};

use async_stream::try_stream;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::{
    AiError,
    provider::{CompletionBackend, CompletionEvent, CompletionTurnRequest, CompletionTurnStream},
    types::{ChatMessage, FinishReason},
};

pub struct RemoteBackend {
    base_url: String,
    model: String,
    client: reqwest::Client,
}

impl RemoteBackend {
    pub fn new(base_url: &str, model: &str) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            model: model.to_string(),
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl CompletionBackend for RemoteBackend {
    async fn stream_turn(
        &self,
        request: CompletionTurnRequest,
    ) -> Result<CompletionTurnStream, AiError> {
        let token = read_access_token()?;
        let endpoint = format!("{}/kuku.ai.v1.AIService/Complete", self.base_url);
        let body = CompleteRequest {
            mode: mode_name(&request),
            message: format_messages(&request),
            context_files: Vec::new(),
            model: self.model.clone(),
        };
        let response = self
            .client
            .post(endpoint)
            .bearer_auth(token)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|error| {
                AiError::ProviderError(format!("Remote AI request failed: {error}"))
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(AiError::ProviderError(format!(
                "Remote AI returned {status}: {}",
                truncate(&text, 512)
            )));
        }

        let output = response.json::<CompleteResponse>().await.map_err(|error| {
            AiError::ProviderError(format!("Remote AI response decode failed: {error}"))
        })?;

        let stream = try_stream! {
            if !output.text.is_empty() {
                yield CompletionEvent::TextDelta(output.text);
            }
            yield CompletionEvent::Finished {
                finish_reason: FinishReason::Stop,
                usage: None,
            };
        };

        Ok(Box::pin(stream))
    }

    async fn list_models(&self) -> Result<Vec<String>, AiError> {
        Ok(vec![self.model.clone()])
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompleteRequest {
    mode: &'static str,
    message: String,
    context_files: Vec<String>,
    model: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompleteResponse {
    #[serde(default)]
    text: String,
}

#[derive(Debug, Deserialize)]
struct StoredTokens {
    access_token: String,
}

fn mode_name(request: &CompletionTurnRequest) -> &'static str {
    if request
        .system_prompt
        .as_deref()
        .is_some_and(|prompt| prompt.contains("Inline"))
    {
        return "CONVERSATION_MODE_INLINE";
    }
    if request.tools.is_empty() {
        return "CONVERSATION_MODE_ASK";
    }
    "CONVERSATION_MODE_AGENT"
}

fn format_messages(request: &CompletionTurnRequest) -> String {
    let mut output = String::new();
    if let Some(system_prompt) = &request.system_prompt {
        output.push_str("System:\n");
        output.push_str(system_prompt);
        output.push_str("\n\n");
    }
    for message in &request.messages {
        match message {
            ChatMessage::System { content } => {
                output.push_str("System:\n");
                output.push_str(content);
            }
            ChatMessage::User { content, .. } => {
                output.push_str("User:\n");
                output.push_str(content);
            }
            ChatMessage::Assistant { content, .. } => {
                output.push_str("Assistant:\n");
                output.push_str(content);
            }
            ChatMessage::ToolResult {
                tool_name,
                output: tool_output,
                is_error,
                ..
            } => {
                output.push_str("Tool result ");
                output.push_str(tool_name);
                if *is_error {
                    output.push_str(" (error)");
                }
                output.push_str(":\n");
                output.push_str(tool_output);
            }
        }
        output.push_str("\n\n");
    }
    output.trim().to_string()
}

fn read_access_token() -> Result<String, AiError> {
    let path = auth_path()?;
    let content = fs::read(path).map_err(|_| AiError::NotConfigured)?;
    let tokens: StoredTokens = serde_json::from_slice(&content)
        .map_err(|error| AiError::State(format!("Invalid auth token JSON: {error}")))?;
    if tokens.access_token.is_empty() {
        return Err(AiError::NotConfigured);
    }
    Ok(tokens.access_token)
}

fn auth_path() -> Result<PathBuf, AiError> {
    let home =
        dirs::home_dir().ok_or_else(|| AiError::State("Cannot resolve home directory".into()))?;
    Ok(home.join(".kuku").join("auth.json"))
}

fn truncate(value: &str, limit: usize) -> String {
    if value.len() <= limit {
        return value.to_string();
    }
    format!("{}...", &value[..limit])
}

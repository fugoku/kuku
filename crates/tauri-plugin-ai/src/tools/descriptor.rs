use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::types::ChatMode;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ToolAccess {
    ReadOnly,
    ProposesMutation,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ToolSource {
    Native,
    Proxy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDescriptor {
    pub name: String,
    pub description: String,
    pub parameters: Value,
    pub category: String,
    pub access: ToolAccess,
    pub source: ToolSource,
}

pub fn allowed_tools(mode: ChatMode, descriptors: &[ToolDescriptor]) -> Vec<ToolDescriptor> {
    match mode {
        ChatMode::Agent => descriptors.to_vec(),
        ChatMode::Ask => descriptors
            .iter()
            .filter(|tool| tool.access == ToolAccess::ReadOnly)
            .cloned()
            .collect(),
        ChatMode::Inline => Vec::new(),
    }
}

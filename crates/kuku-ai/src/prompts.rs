use crate::{tools::ToolDescriptor, types::ChatMode};

pub fn build_system_prompt(mode: ChatMode, tools: &[ToolDescriptor]) -> String {
    let mode_instruction = match mode {
        ChatMode::Ask => {
            "You are Kuku AI in Ask mode. Answer clearly. You may use read-only tools when useful."
        }
        ChatMode::Agent => {
            "You are Kuku AI in Agent mode. You may read from the vault and, when needed, propose edits through tools."
        }
        ChatMode::Inline => {
            "You are Kuku AI in Inline mode. Give a concise answer based only on the user message and editor context."
        }
    };

    if tools.is_empty() {
        return mode_instruction.to_string();
    }

    let tool_lines = tools
        .iter()
        .map(|tool| format!("- {}: {}", tool.name, tool.description))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "{mode_instruction}\n\nAll tool paths are vault-relative. Use an empty string for the vault root, never '/'.\n\nAvailable tools:\n{tool_lines}"
    )
}

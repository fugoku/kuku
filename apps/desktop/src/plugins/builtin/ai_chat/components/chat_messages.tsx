import { For, Show, type JSX } from "solid-js";

import { getActiveSession } from "../chat_store";
import type { ChatMessage } from "../types";
import { ApprovalWidget } from "./approval_widget";
import { MarkdownMessage } from "./markdown_message";
import { ToolCallCard } from "./tool_call_card";

function TextBubble(props: {
  role: "user" | "assistant" | "system";
  content: string;
  streaming?: boolean;
}): JSX.Element {
  return (
    <div
      classList={{
        "self-end border-accent/30 bg-accent/15": props.role === "user",
        "self-start border-border bg-bg-secondary": props.role !== "user",
      }}
      class="max-w-[92%] rounded-2xl border px-3 py-2 text-sm/6 text-text-primary"
    >
      <Show
        when={props.content.length > 0}
        fallback={<span class="text-text-muted">{props.streaming ? "Thinking…" : "…"}</span>}
      >
        <MarkdownMessage content={props.content} />
      </Show>
    </div>
  );
}

function ChatMessages(): JSX.Element {
  const session = () => getActiveSession();

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-3">
      <Show when={session()} fallback={<EmptyState />}>
        {(current) => (
          <For each={current().messages}>
            {(item: ChatMessage) => {
              if (item.kind === "text") {
                return (
                  <TextBubble role={item.role} content={item.content} streaming={item.streaming} />
                );
              }
              if (item.kind === "tool") {
                return <ToolCallCard sessionId={current().id} item={item} />;
              }
              return <ApprovalWidget sessionId={current().id} item={item} />;
            }}
          </For>
        )}
      </Show>
    </div>
  );
}

function EmptyState(): JSX.Element {
  return (
    <div class="flex h-full items-center justify-center p-4 text-center">
      <div class="max-w-64 space-y-2">
        <p class="text-sm text-text-primary">Start a chat session to ask about the vault.</p>
        <p class="text-xs text-text-muted">
          Choose a mode, add your Gemini API key, then send a message.
        </p>
      </div>
    </div>
  );
}

export { ChatMessages };

import { Show, type JSX } from "solid-js";

import { toggleToolExpanded } from "../chat_store";
import type { ChatToolMessage } from "../types";
import {
  getToolPreview,
  getToolStatusLabel,
  getToolStatusTone,
  type ChatUiTone,
} from "../ui_state";

const STATUS_TONE_CLASSES: Record<ChatUiTone, string> = {
  neutral: "border-border bg-bg-primary/60 text-text-secondary",
  accent: "border-accent/30 bg-accent/10 text-accent",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  danger: "border-red-500/30 bg-red-500/10 text-red-300",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

function ToolCallCard(props: { sessionId: string; item: ChatToolMessage }): JSX.Element {
  const statusLabel = () => getToolStatusLabel(props.item);
  const statusTone = () => getToolStatusTone(props.item);

  return (
    <div class="rounded-xl border border-border bg-bg-secondary p-3 text-xs">
      <button
        type="button"
        class="w-full text-left"
        onClick={() => toggleToolExpanded(props.sessionId, props.item.callId)}
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-medium text-text-primary">{props.item.toolName}</div>
            <p class="mt-1 truncate text-[0.6875rem] text-text-muted">
              {getToolPreview(props.item)}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <div
              class={`rounded-full border px-2 py-0.5 text-[0.6875rem] ${STATUS_TONE_CLASSES[statusTone()]}`}
            >
              {statusLabel()}
            </div>
            <span class="text-[0.6875rem] text-text-muted">
              {props.item.expanded ? "Hide" : "Show"}
            </span>
          </div>
        </div>
      </button>
      <Show when={props.item.expanded}>
        <pre class="mt-3 max-h-28 overflow-auto rounded-lg bg-bg-primary/70 p-2 text-[0.6875rem] wrap-break-word whitespace-pre-wrap text-text-muted">
          {JSON.stringify(props.item.arguments, null, 2)}
        </pre>
        <Show when={props.item.output}>
          <pre class="mt-2 max-h-28 overflow-auto rounded-lg border border-border bg-bg-primary/70 p-2 text-[0.6875rem] wrap-break-word whitespace-pre-wrap text-text-secondary">
            {props.item.output}
          </pre>
        </Show>
        <Show when={props.item.error}>
          <p class="mt-2 text-[0.6875rem] text-red-400">{props.item.error}</p>
        </Show>
      </Show>
    </div>
  );
}

export { ToolCallCard };

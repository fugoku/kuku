import { Show } from "solid-js";

import { Switch } from "~/components/ui";

import {
  cancelSession,
  chatState,
  createSession,
  isSessionBusy,
  setAutoApprove,
  switchMode,
} from "../chat_store";
import type { ChatMode, ChatSessionState } from "../types";
import { getSessionStatusMeta, type ChatUiTone } from "../ui_state";

const MODE_LABELS: Record<ChatMode, string> = {
  ask: "Ask",
  agent: "Agent",
  inline: "Inline",
};

const STATUS_TONE_CLASSES: Record<ChatUiTone, string> = {
  neutral: "border-border bg-bg-secondary text-text-secondary",
  accent: "border-accent/30 bg-accent/15 text-accent",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  danger: "border-red-500/30 bg-red-500/10 text-red-300",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

function ChatHeader(): JSX.Element {
  const session = () =>
    chatState.activeSessionId ? (chatState.sessions[chatState.activeSessionId] ?? null) : null;
  const statusMeta = () => getSessionStatusMeta(session());
  const canCancel = () => {
    const current = session();
    return isSessionBusy(current);
  };
  const canAutoApprove = (current: ChatSessionState | null) => current?.mode === "agent";
  const canChangeSession = () => !chatState.isCreatingSession && !isSessionBusy(session());

  return (
    <div class="border-b border-border bg-bg-primary px-4 py-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-text-primary">AI Chat</h2>
          <p class="mt-1 text-[11px] text-text-muted">
            <Show when={session()} fallback={<span>Connect Gemini and start a session.</span>}>
              {(current) => (
                <span>
                  Session {current().id.slice(0, 8)} · {statusMeta().description}
                </span>
              )}
            </Show>
          </p>
        </div>
        <div class="flex flex-col items-end gap-2">
          <div
            class={`rounded-full border px-2.5 py-1 text-[11px] ${STATUS_TONE_CLASSES[statusMeta().tone]}`}
          >
            {statusMeta().label}
          </div>
          <Show when={canAutoApprove(session())}>
            {(current) => (
              <Switch
                checked={current().autoApprove}
                onChange={(enabled) => setAutoApprove(current().id, enabled)}
                label="Auto-approve"
                class="text-[11px]"
              />
            )}
          </Show>
        </div>
      </div>

      <div class="mt-3 flex items-center justify-between gap-2">
        <div class="inline-flex rounded-lg border border-border bg-bg-secondary p-1">
          {(Object.keys(MODE_LABELS) as ChatMode[]).map((mode) => (
            <button
              type="button"
              disabled={!canChangeSession()}
              class="rounded-md px-3 py-1.5 text-xs transition-colors"
              classList={{
                "bg-bg-tertiary text-text-primary": chatState.selectedMode === mode,
                "text-text-muted": chatState.selectedMode !== mode,
                "cursor-not-allowed opacity-50": !canChangeSession(),
              }}
              onClick={() => void switchMode(mode)}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            disabled={!canChangeSession()}
            class="rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            classList={{
              "cursor-not-allowed opacity-50": !canChangeSession(),
            }}
            onClick={() => void createSession(chatState.selectedMode)}
          >
            New Session
          </button>
          <button
            type="button"
            disabled={!canCancel()}
            class="rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void cancelSession()}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export { ChatHeader };

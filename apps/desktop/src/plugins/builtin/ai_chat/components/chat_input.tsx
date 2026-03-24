import { createEffect, createSignal, type JSX } from "solid-js";

import { chatState, sendMessage, setDraft } from "../chat_store";
import { getSessionStatusMeta } from "../ui_state";

function ChatInput(): JSX.Element {
  const [draft, setLocalDraft] = createSignal("");
  const session = () =>
    chatState.activeSessionId ? (chatState.sessions[chatState.activeSessionId] ?? null) : null;
  const isLocked = () => chatState.isCreatingSession || (session()?.status ?? "idle") !== "idle";
  const helperText = () =>
    session()
      ? getSessionStatusMeta(session()).description
      : "Enter sends, Shift+Enter adds a newline.";

  createEffect(() => {
    const activeId = chatState.activeSessionId;
    if (!activeId) {
      setLocalDraft("");
      return;
    }
    setLocalDraft(chatState.sessions[activeId]?.draft ?? "");
  });

  async function submit(): Promise<void> {
    const value = draft();
    await sendMessage(value);
    setLocalDraft("");
  }

  return (
    <div class="border-t border-border bg-bg-primary px-4 py-3">
      <textarea
        rows={4}
        value={draft()}
        placeholder="Ask the assistant about the current vault..."
        class="w-full resize-none rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary transition-colors outline-none focus:border-accent"
        disabled={isLocked()}
        onInput={(event) => {
          const value = event.currentTarget.value;
          setLocalDraft(value);
          setDraft(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      <div class="mt-3 flex items-center justify-between gap-2">
        <p class="text-[0.6875rem] text-text-muted">{helperText()}</p>
        <button
          type="button"
          disabled={isLocked() || chatState.isSendingMessage || !draft().trim()}
          class="rounded-md border border-accent/30 bg-accent/15 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void submit()}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export { ChatInput };

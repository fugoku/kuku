import { For, Show, createEffect, createSignal } from "solid-js";

import { chatState, loadConfig, loadTools, saveConfig } from "../chat_store";

function AiSettings(): JSX.Element {
  const [apiKey, setApiKey] = createSignal("");
  const [model, setModel] = createSignal("");

  createEffect(() => {
    if (!chatState.config.loading && !chatState.config.saving) {
      setApiKey(chatState.config.apiKey);
      setModel(chatState.config.model);
    }
  });

  return (
    <div class="border-t border-border bg-bg-primary px-4 py-3">
      <div class="mb-2 flex items-center justify-between gap-2">
        <h3 class="text-xs font-semibold tracking-[0.12em] text-text-muted uppercase">Settings</h3>
        <button
          type="button"
          class="rounded-md border border-border bg-bg-secondary px-2.5 py-1 text-[11px] text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
          onClick={() => void Promise.all([loadConfig(), loadTools()])}
        >
          Refresh
        </button>
      </div>

      <div class="space-y-3">
        <label class="block space-y-1.5">
          <span class="text-[11px] text-text-muted">API Key</span>
          <input
            type="password"
            value={apiKey()}
            placeholder="Gemini AI Studio API key"
            class="w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary transition-colors outline-none focus:border-accent"
            onInput={(event) => setApiKey(event.currentTarget.value)}
          />
        </label>

        <label class="block space-y-1.5">
          <span class="text-[11px] text-text-muted">Model</span>
          <input
            type="text"
            value={model()}
            placeholder="gemini-2.5-flash"
            class="w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary transition-colors outline-none focus:border-accent"
            onInput={(event) => setModel(event.currentTarget.value)}
          />
        </label>

        <div class="flex items-center justify-between gap-2">
          <div class="space-y-1">
            <Show when={chatState.config.error}>
              {(error) => <p class="text-[11px] text-red-400">{error()}</p>}
            </Show>
            <Show when={chatState.config.toolsError}>
              {(error) => <p class="text-[11px] text-red-400">{error()}</p>}
            </Show>
          </div>
          <button
            type="button"
            disabled={chatState.config.saving}
            class="ml-auto rounded-md border border-accent/30 bg-accent/15 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void saveConfig(apiKey(), model())}
          >
            Save
          </button>
        </div>

        <div class="space-y-1.5 rounded-xl border border-border bg-bg-secondary/70 p-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] tracking-[0.12em] text-text-muted uppercase">
              Available Tools
            </span>
            <span class="text-[11px] text-text-muted">
              {chatState.config.toolsLoading
                ? "Loading..."
                : `${chatState.config.availableTools.length}`}
            </span>
          </div>

          <Show
            when={chatState.config.availableTools.length > 0}
            fallback={<p class="text-[11px] text-text-muted">No tools returned by the backend.</p>}
          >
            <div class="flex flex-wrap gap-2">
              <For each={chatState.config.availableTools}>
                {(tool) => (
                  <div class="rounded-full border border-border bg-bg-primary px-2.5 py-1 text-[11px] text-text-secondary">
                    <span class="font-medium text-text-primary">{tool.name}</span>
                    <span class="ml-1 text-text-muted">· {tool.category}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}

export { AiSettings };

import { For, type JSX } from "solid-js";

import { t } from "~/i18n";
import type { ChatMode } from "../types";

interface SuggestedPrompt {
  text: Parameters<typeof t>[0];
  hint: Parameters<typeof t>[0];
  prompt: string;
  mode: ChatMode;
}

const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  {
    text: "chat.welcome.s1.text",
    hint: "chat.welcome.s1.hint",
    prompt: "Find all notes mentioning this topic and show me how they connect to each other",
    mode: "agent",
  },
  {
    text: "chat.welcome.s2.text",
    hint: "chat.welcome.s2.hint",
    prompt:
      "Summarize this document into key insights and suggest 3 follow-up questions I should explore",
    mode: "ask",
  },
  {
    text: "chat.welcome.s3.text",
    hint: "chat.welcome.s3.hint",
    prompt:
      "Create a new note that synthesizes my recent thoughts on this topic with proper [[wiki-links]] to existing notes",
    mode: "agent",
  },
  {
    text: "chat.welcome.s4.text",
    hint: "chat.welcome.s4.hint",
    prompt:
      "Review my vault and identify unlinked notes that should be connected, then suggest specific links to add",
    mode: "agent",
  },
];

interface ChatWelcomeProps {
  mode: ChatMode;
  onSubmit: (mode: ChatMode, prompt: string) => void;
}

function ChatWelcome(props: ChatWelcomeProps): JSX.Element {
  return (
    <div class="flex min-h-0 flex-1 flex-col justify-center">
      <div class="mx-auto w-full max-w-md px-4 py-6">
        <header class="mb-8 text-center sm:mb-10">
          <h1 class="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
            {t("chat.welcome.title")}
          </h1>
          <p class="mt-2 text-[0.8125rem] leading-relaxed text-pretty text-text-secondary">
            {props.mode === "agent"
              ? t("chat.welcome.subtitle.agent")
              : t("chat.welcome.subtitle.ask")}
          </p>
        </header>

        <div>
          <p class="mb-2.5 pl-0.5 text-[0.625rem] font-semibold tracking-[0.18em] text-text-muted uppercase">
            {t("chat.welcome.try_asking")}
          </p>
          <div class="overflow-hidden rounded-lg border border-border/80 bg-bg-secondary/40">
            <ul class="divide-y divide-border/70">
              <For each={SUGGESTED_PROMPTS}>
                {(item) => (
                  <li>
                    <button
                      type="button"
                      class="group flex w-full flex-col items-start gap-0.5 px-4 py-3.5 text-left transition hover:bg-ghost-hover active:bg-ghost-active"
                      onClick={() => props.onSubmit(item.mode, item.prompt)}
                    >
                      <span class="text-sm font-medium text-text-primary">{t(item.text)}</span>
                      <span class="text-xs/snug text-text-muted">{t(item.hint)}</span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export { ChatWelcome };

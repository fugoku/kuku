import { createSignal, For, onMount, Show } from "solid-js";

import { EyeIcon, FileIcon, FolderPlusIcon, PlusIcon } from "~/components/icons/general_icons";
import { openTab } from "~/stores/files";

import { createKnowledgeService } from "../service";
import type {
  CreateDecisionDocumentRequest,
  CreateDecisionDocumentResult,
  KnowledgeCommandResult,
  KnowledgeInitResult,
  KnowledgeStatusResult,
} from "../types";

const BUTTON =
  "inline-flex h-7 items-center justify-center gap-1.5 rounded-xs border border-border bg-bg-secondary px-2 text-[0.6875rem] font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50";

const STATUS_ITEMS: { key: keyof KnowledgeStatusResult; label: string }[] = [
  { key: "initialized", label: "Initialized" },
  { key: "root_exists", label: "Root" },
  { key: "memory_dir_exists", label: "Memory" },
  { key: "proposals_dir_exists", label: "Proposals" },
  { key: "decisions_dir_exists", label: "Decisions" },
  { key: "cache_dir_exists", label: "Cache" },
];

function debugProposalRequest(label: string): CreateDecisionDocumentRequest {
  return {
    title: `Knowledge Debug ${label}`,
    context: "Created from the Second Brain debug panel to verify proposal document generation.",
    default_selection: "yes",
    proposed_memories: [
      {
        kind: "decision",
        title: `Debug memory ${label}`,
        body: "This generated proposal is only for checking the knowledge-layer proposal path. It does not write committed memory.",
        tags: ["knowledge", "debug"],
      },
    ],
  };
}

function formatCommandError(
  result: Exclude<KnowledgeCommandResult<unknown>, { ok: true }>,
): string {
  return `${result.error.code}: ${result.error.message}`;
}

function statusChipClass(value: boolean | undefined): string {
  if (value === true) return "border-success-border bg-success-bg text-success";
  if (value === false) return "border-warning-border bg-warning-bg text-warning";
  return "border-border bg-bg-secondary text-text-muted";
}

function statusChipLabel(value: boolean | undefined): string {
  if (value === undefined) return "n/a";
  if (value) return "yes";
  return "no";
}

function StatusChip(props: { value?: boolean }) {
  return (
    <span
      class={`min-w-10 rounded-xs border px-1.5 py-0.5 text-center text-[0.625rem] ${statusChipClass(
        props.value,
      )}`}
    >
      {statusChipLabel(props.value)}
    </span>
  );
}

function KnowledgePanel() {
  const service = createKnowledgeService();
  const [status, setStatus] = createSignal<KnowledgeStatusResult | null>(null);
  const [initResult, setInitResult] = createSignal<KnowledgeInitResult | null>(null);
  const [createdDoc, setCreatedDoc] = createSignal<CreateDecisionDocumentResult | null>(null);
  const [busy, setBusy] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const isBusy = () => busy() !== null;

  async function runCommand<T>(
    command: string,
    action: () => Promise<KnowledgeCommandResult<T>>,
    onSuccess: (value: T) => void,
  ): Promise<void> {
    setBusy(command);
    setError(null);

    try {
      const result = await action();
      if (result.ok) {
        onSuccess(result.value);
        return;
      }

      setError(formatCommandError(result));
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : String(commandError));
    } finally {
      setBusy(null);
    }
  }

  function refreshStatus(): Promise<void> {
    return runCommand("knowledge_status", () => service.status(), setStatus);
  }

  function initializeKnowledge(): Promise<void> {
    return runCommand(
      "knowledge_init",
      () => service.init(),
      (value) => {
        setInitResult(value);
        setStatus(value);
      },
    );
  }

  function createDecisionDocument(): Promise<void> {
    return runCommand(
      "knowledge_create_decision_document",
      () => service.createDecisionDocument(debugProposalRequest("UI")),
      (value) => {
        setCreatedDoc(value);
        openTab(value.title, value.path, "editor");
      },
    );
  }

  function proposeMemory(): Promise<void> {
    return runCommand(
      "memory_propose",
      () => service.proposeMemory(debugProposalRequest("Tool")),
      (value) => {
        setCreatedDoc(value);
        openTab(value.title, value.path, "editor");
      },
    );
  }

  function openCreatedDocument(): void {
    const doc = createdDoc();
    if (!doc) return;
    openTab(doc.title, doc.path, "editor");
  }

  onMount(() => {
    void refreshStatus();
  });

  return (
    <section class="flex h-full min-h-0 flex-col bg-bg-secondary/60 text-sm">
      <header class="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-bg-primary/50 px-3 py-2">
        <h2 class="min-w-0 truncate text-[0.75rem] font-medium text-text-primary">Second Brain</h2>
        <button
          type="button"
          class={BUTTON}
          disabled={isBusy()}
          title="Refresh knowledge status"
          onClick={() => void refreshStatus()}
        >
          Status
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-auto p-3">
        <div class="flex flex-col gap-3">
          <section class="rounded-xs border border-border bg-bg-primary/60">
            <div class="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
              <div>
                <h3 class="text-[0.75rem] font-medium text-text-primary">Debug</h3>
                <p class="mt-0.5 text-[0.6875rem] text-text-muted">
                  Proposal document checks only.
                </p>
              </div>
              <Show when={busy()}>
                {(command) => (
                  <span class="rounded-xs border border-border bg-bg-secondary px-1.5 py-0.5 font-mono text-[0.625rem] text-text-muted">
                    {command()}
                  </span>
                )}
              </Show>
            </div>

            <div class="flex flex-col gap-2 p-3">
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class={BUTTON}
                  disabled={isBusy()}
                  title="Create Knowledge directories"
                  onClick={() => void initializeKnowledge()}
                >
                  <FolderPlusIcon />
                  Init
                </button>
                <button
                  type="button"
                  class={BUTTON}
                  disabled={isBusy()}
                  title="Create a sample decision document from the UI command"
                  onClick={() => void createDecisionDocument()}
                >
                  <FileIcon />
                  UI doc
                </button>
                <button
                  type="button"
                  class={BUTTON}
                  disabled={isBusy()}
                  title="Create a sample decision document through memory_propose"
                  onClick={() => void proposeMemory()}
                >
                  <PlusIcon />
                  Tool doc
                </button>
                <button
                  type="button"
                  class={BUTTON}
                  disabled={isBusy() || !createdDoc()}
                  title="Open the last generated decision document"
                  onClick={openCreatedDocument}
                >
                  <EyeIcon />
                  Open
                </button>
              </div>

              <Show when={error()}>
                {(message) => (
                  <p class="rounded-xs border border-error-border bg-error-bg px-2 py-1.5 text-[0.6875rem] text-error">
                    {message()}
                  </p>
                )}
              </Show>

              <Show when={createdDoc()}>
                {(doc) => (
                  <div class="rounded-xs border border-border bg-bg-secondary px-2 py-1.5">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[0.6875rem] font-medium text-text-secondary">
                        Last document
                      </span>
                      <span class="text-[0.625rem] text-text-muted">
                        {doc().should_open ? "openable" : "closed"}
                      </span>
                    </div>
                    <p class="mt-1 truncate font-mono text-[0.6875rem] text-text-muted">
                      {doc().path}
                    </p>
                  </div>
                )}
              </Show>
            </div>
          </section>

          <section class="rounded-xs border border-border bg-bg-primary/60">
            <div class="border-b border-border/70 px-3 py-2">
              <h3 class="text-[0.75rem] font-medium text-text-primary">Status</h3>
            </div>
            <div class="flex flex-col divide-y divide-border/60">
              <For each={STATUS_ITEMS}>
                {(item) => (
                  <div class="flex items-center justify-between gap-3 px-3 py-2">
                    <span class="text-[0.6875rem] text-text-secondary">{item.label}</span>
                    <StatusChip value={status()?.[item.key]} />
                  </div>
                )}
              </For>
            </div>
          </section>

          <Show when={initResult()?.created_dirs.length}>
            <section class="rounded-xs border border-border bg-bg-primary/60">
              <div class="border-b border-border/70 px-3 py-2">
                <h3 class="text-[0.75rem] font-medium text-text-primary">Created dirs</h3>
              </div>
              <div class="flex flex-col gap-1 p-3">
                <For each={initResult()?.created_dirs ?? []}>
                  {(path) => (
                    <span class="truncate font-mono text-[0.6875rem] text-text-muted">{path}</span>
                  )}
                </For>
              </div>
            </section>
          </Show>
        </div>
      </div>
    </section>
  );
}

export default KnowledgePanel;

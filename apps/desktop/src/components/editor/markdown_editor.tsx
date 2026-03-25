import { createEffect, onCleanup, onMount } from "solid-js";
import { union } from "prosekit/core";
import { ProseKit, useDocChange, useKeymap } from "prosekit/solid";

import { createKukuEditor, destroyEditor } from "~/components/editor/system/editor_engine";
import { getMarkdownService } from "~/plugins/markdown_service";
import { setContextKey } from "~/plugins/context_keys";
import { defineDiffSchemaExtension, defineReadonly } from "~/plugins/builtin/diff_view";
import { markTabDirty } from "~/stores/files";
import { getDiffEntry } from "~/stores/diff_store";
import { readFileWithChecksum, writeFileWithChecksum } from "~/lib/vault_fs";
import { settingsState } from "~/stores/settings";
import { revealPath, setSelectedPath } from "~/stores/vault";
import { applyPendingSearchNavigation } from "~/plugins/builtin/search/navigation";

import "~/styles/editor.css";
import "~/styles/wikilink.css";
import "~/plugins/builtin/diff_view/diff_view.css";

interface MarkdownEditorProps {
  tabId: string;
  filePath: string;
  mode?: "editable" | "diff";
}

export default function MarkdownEditor(props: MarkdownEditorProps) {
  const mode = props.mode ?? "editable";
  const isDiffMode = mode === "diff";
  const editor = createKukuEditor(
    isDiffMode ? union(defineDiffSchemaExtension(), defineReadonly()) : undefined,
  );
  let disposed = false;
  let settingContent = false;
  let checksum: string | null = null;
  let autoSaveTimer: number | null = null;
  let saveInFlight: Promise<void> | null = null;
  let inFlightSaveContent: string | null = null;
  let queuedSaveContent: string | null = null;

  function clearAutoSaveTimer(): void {
    if (autoSaveTimer === null) return;
    window.clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }

  function scheduleAutoSave(): void {
    clearAutoSaveTimer();
    autoSaveTimer = window.setTimeout(() => {
      autoSaveTimer = null;
      void saveDocument();
    }, 800);
  }

  function getDiffSourcePath(): string | null {
    return getDiffEntry(props.filePath)?.sourceFilePath ?? null;
  }

  async function loadEditableDocument(): Promise<void> {
    const markdown = getMarkdownService();
    if (!markdown) return;

    try {
      const result = await readFileWithChecksum(props.filePath);
      if (disposed) return;

      settingContent = true;
      try {
        editor.setContent(markdown.parse(result.content), "start");
      } finally {
        settingContent = false;
      }
      applyPendingSearchNavigation(editor, props.filePath, { clearOnMiss: true });

      checksum = result.checksum;
      markTabDirty(props.tabId, false);
    } catch (error) {
      if (disposed) return;
      // oxlint-disable-next-line no-console -- intentional error logging
      console.error("Failed to load document:", error);
    }
  }

  async function loadDiffDocument(): Promise<void> {
    const diffEntry = getDiffEntry(props.filePath);
    if (!diffEntry || disposed) return;

    settingContent = true;
    try {
      editor.setContent(diffEntry.diffDoc, "start");
    } finally {
      settingContent = false;
    }
    markTabDirty(props.tabId, false);
  }

  function getSaveContent(): string | null {
    clearAutoSaveTimer();
    if (isDiffMode || !checksum) return null;

    const markdown = getMarkdownService();
    if (!markdown) return null;

    const json = editor.getDocJSON();
    return markdown.stringify(json);
  }

  async function saveDocument(): Promise<void> {
    const content = getSaveContent();
    if (content === null) return;

    if (content === queuedSaveContent || content === inFlightSaveContent) {
      await (saveInFlight ?? Promise.resolve());
      return;
    }

    queuedSaveContent = content;
    if (saveInFlight) {
      await saveInFlight;
      return;
    }

    saveInFlight = (async () => {
      while (queuedSaveContent !== null) {
        const contentToWrite = queuedSaveContent;
        queuedSaveContent = null;

        const currentChecksum = checksum;
        if (!currentChecksum) return;

        inFlightSaveContent = contentToWrite;

        try {
          const result = await writeFileWithChecksum(props.filePath, contentToWrite, currentChecksum);

          if (result.status === "Written") {
            checksum = result.checksum;
            if (queuedSaveContent === null) {
              markTabDirty(props.tabId, false);
            }
          } else {
            queuedSaveContent = null;
            // oxlint-disable-next-line no-console -- intentional warning for save conflicts
            console.warn("Save conflict:", result);
            return;
          }
        } catch (error) {
          queuedSaveContent = null;
          // oxlint-disable-next-line no-console -- intentional error logging
          console.error("Failed to save document:", error);
          return;
        } finally {
          inFlightSaveContent = null;
        }
      }
    })();

    try {
      await saveInFlight;
    } finally {
      saveInFlight = null;
      inFlightSaveContent = null;
    }
  }

  function handleFocusIn() {
    if (isDiffMode) return;
    setContextKey("editorTextFocus", true);
  }

  function handleFocusOut(e: FocusEvent) {
    if (isDiffMode) return;
    const related = e.relatedTarget as Node | null;
    const container = e.currentTarget as HTMLElement;
    if (!related || !container.contains(related)) {
      setContextKey("editorTextFocus", false);
    }
  }

  onMount(() => {
    setContextKey("editorTextFocus", false);
  });

  onCleanup(() => {
    if (settingsState.general.autoSave && (autoSaveTimer !== null || saveInFlight !== null)) {
      void saveDocument();
    } else {
      clearAutoSaveTimer();
    }
    disposed = true;
    setContextKey("editorTextFocus", false);
    destroyEditor();
  });

  createEffect(() => {
    const targetPath = isDiffMode ? getDiffSourcePath() : props.filePath;
    if (!targetPath) return;

    setSelectedPath(targetPath);
    revealPath(targetPath);
  });

  createEffect(() => {
    if (isDiffMode) {
      void loadDiffDocument();
      return;
    }

    void loadEditableDocument();
  });

  useDocChange(
    () => {
      if (isDiffMode || settingContent || disposed) return;
      markTabDirty(props.tabId, true);
      if (settingsState.general.autoSave) {
        scheduleAutoSave();
      }
    },
    { editor },
  );

  useKeymap(
    () => ({
      "Mod-s": () => {
        if (isDiffMode) {
          return false;
        }

        void saveDocument();
        return true;
      },
    }),
    { editor },
  );

  return (
    <ProseKit editor={editor}>
      <div
        class="size-full overflow-y-auto bg-bg-primary"
        data-diff-editor={isDiffMode ? "" : undefined}
        spellcheck={!isDiffMode && settingsState.general.spellCheck}
        onFocusIn={handleFocusIn}
        onFocusOut={handleFocusOut}
      >
        <div ref={editor.mount} />
      </div>
    </ProseKit>
  );
}

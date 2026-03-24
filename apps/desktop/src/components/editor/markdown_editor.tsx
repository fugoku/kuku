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

  async function saveDocument(): Promise<void> {
    if (isDiffMode || !checksum || disposed) return;

    const markdown = getMarkdownService();
    if (!markdown) return;

    const json = editor.getDocJSON();
    const content = markdown.stringify(json);

    try {
      const result = await writeFileWithChecksum(props.filePath, content, checksum);
      if (disposed) return;

      if (result.status === "Written") {
        checksum = result.checksum;
        markTabDirty(props.tabId, false);
      } else {
        // oxlint-disable-next-line no-console -- intentional warning for save conflicts
        console.warn("Save conflict:", result);
      }
    } catch (error) {
      if (disposed) return;
      // oxlint-disable-next-line no-console -- intentional error logging
      console.error("Failed to save document:", error);
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
        onFocusIn={handleFocusIn}
        onFocusOut={handleFocusOut}
      >
        <div ref={editor.mount} />
      </div>
    </ProseKit>
  );
}

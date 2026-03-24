import { getActiveEditorInstance } from "~/components/editor/system/editor_engine";
import { getActiveTab } from "~/stores/files";

import type { ChatSnapshotSource, EditorContext } from "./types";

function createContextSnapshotSource(): ChatSnapshotSource {
  return {
    snapshot(): EditorContext {
      const editor = getActiveEditorInstance();
      const activeTab = getActiveTab();
      const activeFile = activeTab?.type === "editor" ? (activeTab.filePath ?? null) : null;
      const selectedText =
        editor?.view && !editor.view.state.selection.empty
          ? editor.view.state.doc.textBetween(
              editor.view.state.selection.from,
              editor.view.state.selection.to,
              "\n",
            )
          : null;

      return {
        activeFile,
        selectedText,
      };
    },
  };
}

export { createContextSnapshotSource };

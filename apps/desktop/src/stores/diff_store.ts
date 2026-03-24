import { createStore, produce } from "solid-js/store";

import type { PMNodeJSON } from "~/lib/markdown";

interface DiffEntry {
  sourceFilePath: string;
  oldMarkdown: string;
  newMarkdown: string;
  diffDoc: PMNodeJSON;
}

interface DiffStoreState {
  entries: Record<string, DiffEntry>;
}

const DIFF_TAB_PREFIX = "diff://";

const [diffStoreState, setDiffStoreState] = createStore<DiffStoreState>({
  entries: {},
});

function createDiffTabPath(sourceFilePath: string): string {
  return `${DIFF_TAB_PREFIX}${sourceFilePath}`;
}

function isDiffTabPath(filePath: string | null | undefined): filePath is string {
  return typeof filePath === "string" && filePath.startsWith(DIFF_TAB_PREFIX);
}

function getSourceFilePathFromDiffPath(filePath: string | null | undefined): string | null {
  if (!isDiffTabPath(filePath)) {
    return null;
  }

  return filePath.slice(DIFF_TAB_PREFIX.length);
}

function registerDiff(
  sourceFilePath: string,
  oldMarkdown: string,
  newMarkdown: string,
  diffDoc: PMNodeJSON,
): string {
  const diffTabPath = createDiffTabPath(sourceFilePath);
  setDiffStoreState("entries", diffTabPath, {
    sourceFilePath,
    oldMarkdown,
    newMarkdown,
    diffDoc,
  });
  return diffTabPath;
}

function getDiffEntry(diffTabPath: string): DiffEntry | undefined {
  return diffStoreState.entries[diffTabPath];
}

function removeDiffEntry(diffTabPath: string): void {
  setDiffStoreState(
    "entries",
    produce((entries) => {
      delete entries[diffTabPath];
    }),
  );
}

export {
  createDiffTabPath,
  getDiffEntry,
  getSourceFilePathFromDiffPath,
  isDiffTabPath,
  registerDiff,
  removeDiffEntry,
};
export type { DiffEntry };

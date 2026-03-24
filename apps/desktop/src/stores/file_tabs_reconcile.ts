import { getSourceFilePathFromDiffPath } from "~/stores/diff_store";

interface TabLike {
  id: string;
  filePath: string | null;
  type: string;
}

interface ReconcileTabsResult<T extends TabLike> {
  tabs: T[];
  activeTabId: string | null;
  removedTabIds: string[];
}

function reconcileTabsWithExistingPaths<T extends TabLike>(
  tabs: T[],
  activeTabId: string | null,
  existingPaths: Set<string>,
): ReconcileTabsResult<T> {
  const resolvedFilePath = (tab: T): string | null => {
    if (tab.type === "diff") {
      return getSourceFilePathFromDiffPath(tab.filePath);
    }
    return tab.filePath;
  };

  const removedTabIds = tabs
    .filter((tab) => {
      if (tab.type !== "editor" && tab.type !== "diff") {
        return false;
      }

      const filePath = resolvedFilePath(tab);
      return filePath !== null && !existingPaths.has(filePath);
    })
    .map((tab) => tab.id);

  if (removedTabIds.length === 0) {
    return {
      tabs,
      activeTabId,
      removedTabIds,
    };
  }

  const removedSet = new Set(removedTabIds);
  const nextTabs = tabs.filter((tab) => !removedSet.has(tab.id));

  let nextActiveTabId = activeTabId;
  if (activeTabId && removedSet.has(activeTabId)) {
    nextActiveTabId = null;
    const activeIndex = tabs.findIndex((tab) => tab.id === activeTabId);

    for (let index = activeIndex + 1; index < tabs.length; index += 1) {
      if (!removedSet.has(tabs[index].id)) {
        nextActiveTabId = tabs[index].id;
        break;
      }
    }

    if (!nextActiveTabId) {
      for (let index = activeIndex - 1; index >= 0; index -= 1) {
        if (!removedSet.has(tabs[index].id)) {
          nextActiveTabId = tabs[index].id;
          break;
        }
      }
    }
  }

  return {
    tabs: nextTabs,
    activeTabId: nextActiveTabId,
    removedTabIds,
  };
}

export { reconcileTabsWithExistingPaths };
export type { ReconcileTabsResult, TabLike };

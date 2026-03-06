import { getCurrentWindow } from "@tauri-apps/api/window";
import { createStore, produce } from "solid-js/store";

import { registerCommand, unregisterCommand } from "~/keybindings/command_registry";
import { addKeybinding, removeKeybinding } from "~/keybindings/keybinding_manager";

// ── Types ──

type TabType = "editor" | "graph" | "search" | "settings";

interface Tab {
  id: string;
  fileName: string;
  filePath: string | null;
  type: TabType;
  isDirty: boolean;
}

interface FilesState {
  tabs: Tab[];
  activeTabId: string | null;
}

// ── Helpers ──

const STORE_KEY = "tabs-state";

function createTab(
  fileName: string,
  filePath: string | null = null,
  type: TabType = "editor",
): Tab {
  return {
    id: crypto.randomUUID(),
    fileName,
    filePath,
    type,
    isDirty: false,
  };
}

function loadTabsSync(): FilesState {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return { tabs: [], activeTabId: null };
  try {
    const data = JSON.parse(raw) as {
      tabs?: { fileName: string; filePath: string; type?: TabType }[];
      activeFilePath?: string | null;
    };
    if (!data?.tabs?.length) return { tabs: [], activeTabId: null };

    const restored = data.tabs.map((t) =>
      createTab(t.fileName, t.filePath || null, t.type ?? "editor"),
    );
    const active = data.activeFilePath
      ? restored.find((t) => t.filePath === data.activeFilePath)
      : restored[0];

    return { tabs: restored, activeTabId: active?.id ?? null };
  } catch {
    return { tabs: [], activeTabId: null };
  }
}

function saveTabsSync(): void {
  const active = getActiveTab();
  const data = {
    tabs: filesState.tabs.map((t) => ({
      fileName: t.fileName,
      filePath: t.filePath ?? "",
      type: t.type,
    })),
    activeFilePath: active?.filePath ?? null,
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

// ── Store ──

const [filesState, setFilesState] = createStore<FilesState>(loadTabsSync());

// ── Getters ──

function getActiveTab(): Tab | undefined {
  return filesState.tabs.find((t) => t.id === filesState.activeTabId);
}

// ── Actions ──

function openTab(fileName: string, filePath: string | null = null, type: TabType = "editor"): void {
  // Focus existing tab if same filePath
  if (filePath) {
    const existing = filesState.tabs.find((t) => t.filePath === filePath);
    if (existing) {
      setFilesState("activeTabId", existing.id);
      saveTabsSync();
      return;
    }
  }

  // Focus existing singleton tab (graph, search, settings)
  if (type !== "editor") {
    const existing = filesState.tabs.find((t) => t.type === type);
    if (existing) {
      setFilesState("activeTabId", existing.id);
      saveTabsSync();
      return;
    }
  }

  const tab = createTab(fileName, filePath, type);
  setFilesState(
    produce((s) => {
      s.tabs.push(tab);
      s.activeTabId = tab.id;
    }),
  );
  saveTabsSync();
}

function closeTab(tabId: string): void {
  const idx = filesState.tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;

  setFilesState(
    produce((s) => {
      if (s.activeTabId === tabId) {
        if (s.tabs.length > 1) {
          const nextIdx = idx < s.tabs.length - 1 ? idx + 1 : idx - 1;
          s.activeTabId = s.tabs[nextIdx].id;
        } else {
          s.activeTabId = null;
        }
      }
      s.tabs.splice(idx, 1);
    }),
  );
  saveTabsSync();
}

function setActiveTab(tabId: string): void {
  setFilesState("activeTabId", tabId);
  saveTabsSync();
}

function markTabDirty(tabId: string, isDirty: boolean): void {
  const idx = filesState.tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;
  setFilesState("tabs", idx, "isDirty", isDirty);
}

function nextTab(): void {
  const { tabs, activeTabId } = filesState;
  if (!activeTabId || tabs.length <= 1) return;
  const idx = tabs.findIndex((t) => t.id === activeTabId);
  if (idx === -1) return;
  setFilesState("activeTabId", tabs[(idx + 1) % tabs.length].id);
}

function prevTab(): void {
  const { tabs, activeTabId } = filesState;
  if (!activeTabId || tabs.length <= 1) return;
  const idx = tabs.findIndex((t) => t.id === activeTabId);
  if (idx === -1) return;
  setFilesState("activeTabId", tabs[(idx - 1 + tabs.length) % tabs.length].id);
}

// ── Tab commands ──

const COMMAND_IDS = ["tab.close", "tab.new", "tab.next", "tab.prev"] as const;
const KEY_COMBOS = ["$mod+KeyN", "Control+Tab", "Control+Shift+Tab"] as const;

function registerFileCommands(): void {
  registerCommand({
    id: "tab.close",
    label: "Close Tab",
    execute: () => {
      const tab = getActiveTab();
      if (tab) closeTab(tab.id);
    },
  });
  registerCommand({
    id: "tab.new",
    label: "New Tab",
    execute: () => openTab("Untitled"),
  });
  addKeybinding({
    keys: "$mod+KeyN",
    commandId: "tab.new",
  });

  registerCommand({
    id: "tab.next",
    label: "Next Tab",
    execute: () => nextTab(),
  });
  addKeybinding({
    keys: "Control+Tab",
    commandId: "tab.next",
    when: () => filesState.tabs.length > 1,
  });

  registerCommand({
    id: "tab.prev",
    label: "Previous Tab",
    execute: () => prevTab(),
  });
  addKeybinding({
    keys: "Control+Shift+Tab",
    commandId: "tab.prev",
    when: () => filesState.tabs.length > 1,
  });
}

function unregisterFileCommands(): void {
  for (const id of COMMAND_IDS) {
    unregisterCommand(id);
  }
  for (const keys of KEY_COMBOS) {
    removeKeybinding(keys);
  }
}

// ── Window close handler (intercepts ⌘W) ──

let closeUnlisten: (() => void) | undefined;

async function initCloseHandler(): Promise<void> {
  closeUnlisten = await getCurrentWindow().onCloseRequested((event) => {
    event.preventDefault();
    const tab = getActiveTab();
    if (tab) {
      closeTab(tab.id);
    }
  });
}

function destroyCloseHandler(): void {
  closeUnlisten?.();
  closeUnlisten = undefined;
}

// ── Exports ──

export {
  closeTab,
  destroyCloseHandler,
  filesState,
  getActiveTab,
  initCloseHandler,
  markTabDirty,
  nextTab,
  openTab,
  prevTab,
  registerFileCommands,
  setActiveTab,
  unregisterFileCommands,
};
export type { Tab, TabType };

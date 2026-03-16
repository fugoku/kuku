import { registerCommand, unregisterCommand } from "~/keybindings/command_registry";
import { addKeybinding, removeKeybinding } from "~/keybindings/keybinding_manager";
import type { KeyboardContext } from "~/keybindings/keyboard_context";
import { closeTab, filesState, getActiveTab, nextTab, openTab, prevTab } from "~/stores/files";
import { layoutState, toggleBottomPanel, toggleLeftPanel, toggleRightPanel } from "~/stores/layout";
import { toggleTheme } from "~/stores/theme";

// ── ID & key lists (for bulk unregister) ──

const DEFAULT_COMMAND_IDS = [
  "panel.toggleLeft",
  "panel.toggleRight",
  "panel.toggleBottom",
  "tab.new",
  "tab.close",
  "tab.next",
  "tab.prev",
  "app.toggleTheme",
  "app.openSearch",
  "app.openSettings",
  "graph.cycle",
] as const;

const DEFAULT_KEYS = [
  "$mod+KeyB",
  "$mod+Shift+KeyB",
  "$mod+KeyJ",
  "$mod+KeyN",
  "$mod+KeyW",
  "Control+Tab",
  "Control+Shift+Tab",
  "$mod+Shift+KeyT",
  "$mod+Shift+KeyF",
  "$mod+Comma",
  "$mod+KeyG",
] as const;

// ── Register ──

function registerDefaultCommands(): void {
  // ── Panel ──

  registerCommand({
    id: "panel.toggleLeft",
    label: "Toggle Left Panel",
    execute: () => toggleLeftPanel(),
  });
  addKeybinding({
    keys: "$mod+KeyB",
    commandId: "panel.toggleLeft",
    when: (ctx: KeyboardContext) => !ctx.editorHasSelection,
  });

  registerCommand({
    id: "panel.toggleRight",
    label: "Toggle Right Panel",
    execute: () => toggleRightPanel(),
  });
  addKeybinding({ keys: "$mod+Shift+KeyB", commandId: "panel.toggleRight" });

  registerCommand({
    id: "panel.toggleBottom",
    label: "Toggle Bottom Panel",
    execute: () => toggleBottomPanel(),
  });
  addKeybinding({ keys: "$mod+KeyJ", commandId: "panel.toggleBottom" });

  // ── Tabs ──

  registerCommand({
    id: "tab.new",
    label: "New Tab",
    execute: () => openTab("Untitled"),
  });
  addKeybinding({ keys: "$mod+KeyN", commandId: "tab.new" });

  registerCommand({
    id: "tab.close",
    label: "Close Tab",
    execute: () => {
      const tab = getActiveTab();
      if (tab) closeTab(tab.id);
    },
  });
  addKeybinding({
    keys: "$mod+KeyW",
    commandId: "tab.close",
    when: () => getActiveTab() !== undefined,
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

  // ── App ──

  registerCommand({
    id: "app.toggleTheme",
    label: "Toggle Theme",
    execute: () => toggleTheme(),
  });
  addKeybinding({ keys: "$mod+Shift+KeyT", commandId: "app.toggleTheme" });

  registerCommand({
    id: "app.openSearch",
    label: "Open Search",
    execute: () => openTab("Search", null, "search"),
  });
  addKeybinding({ keys: "$mod+Shift+KeyF", commandId: "app.openSearch" });

  registerCommand({
    id: "app.openSettings",
    label: "Open Settings",
    execute: () => openTab("Settings", null, "settings"),
  });
  addKeybinding({ keys: "$mod+Comma", commandId: "app.openSettings" });

  // ── Graph cycle: right panel → center tab → close ──

  registerCommand({
    id: "graph.cycle",
    label: "Toggle Graph",
    execute: () => {
      const graphTab = filesState.tabs.find((t) => t.type === "graph");

      if (graphTab) {
        // Graph tab open in center → close it
        closeTab(graphTab.id);
      } else if (layoutState.rightPanelOpen) {
        // Right panel showing graph → move to center tab, close panel
        openTab("Graph", null, "graph");
        toggleRightPanel();
      } else {
        // Nothing open → open right panel
        toggleRightPanel();
      }
    },
  });
  addKeybinding({ keys: "$mod+KeyG", commandId: "graph.cycle" });
}

// ── Unregister ──

function unregisterDefaultCommands(): void {
  for (const id of DEFAULT_COMMAND_IDS) {
    unregisterCommand(id);
  }
  for (const keys of DEFAULT_KEYS) {
    removeKeybinding(keys);
  }
}

// ── Exports ──

export { registerDefaultCommands, unregisterDefaultCommands };

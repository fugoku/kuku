import { getCurrentWindow } from "@tauri-apps/api/window";
import { type Accessor, createEffect, createMemo, createSignal, onCleanup } from "solid-js";

import { registerCommand, unregisterCommand } from "~/keybindings/command_registry";
import { addKeybinding, removeKeybinding } from "~/keybindings/keybinding_manager";
import { setAppearanceSetting, settingsState } from "~/stores/settings";

// ── Types ──

export type ThemePreference = "system" | "light" | "dark";
export type EffectiveTheme = "light" | "dark";

export interface UseThemeReturn {
  /** Current preference (system | light | dark) */
  preference: Accessor<ThemePreference>;
  /** Resolved theme after applying system detection */
  effectiveTheme: Accessor<EffectiveTheme>;
  /** Set theme preference */
  setTheme: (theme: ThemePreference) => void;
  /** Toggle between light and dark (ignores system) */
  toggleTheme: () => void;
}

// ── Constants ──

const BG_COLORS: Record<EffectiveTheme, string> = {
  dark: "#1a1a1a",
  light: "#ffffff",
};

// ── Helpers ──

/** Update inline styles on <html> and <body> to prevent flash on resize / theme switch. */
function applyBgColor(theme: EffectiveTheme): void {
  const color = BG_COLORS[theme];
  document.documentElement.style.backgroundColor = color;
  document.documentElement.style.colorScheme = theme;
  document.body.style.backgroundColor = color;

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.content = color;
  }
}

// ── Hook ──

export function useTheme(): UseThemeReturn {
  // Detect system theme via matchMedia (works in Safari/WebKit regardless of Tauri config)
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const [systemIsDark, setSystemIsDark] = createSignal(mediaQuery.matches);

  const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
  mediaQuery.addEventListener("change", handler);
  onCleanup(() => mediaQuery.removeEventListener("change", handler));

  // Read preference from settings store (reactive)
  const preference = (): ThemePreference => settingsState.appearance.theme;

  // Resolve effective theme
  const effectiveTheme = createMemo<EffectiveTheme>(() => {
    const pref = preference();
    if (pref === "system") {
      return systemIsDark() ? "dark" : "light";
    }
    return pref;
  });

  // Apply theme to DOM + native window whenever it changes
  const win = getCurrentWindow();

  createEffect(() => {
    const theme = effectiveTheme();

    if (theme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }

    applyBgColor(theme);

    // Sync native window theme so resize/expand doesn't flash wrong bg color.
    // null = follow OS (keeps matchMedia responsive), explicit value = lock window theme.
    const pref = preference();
    void win.setTheme(pref === "system" ? null : pref);
  });

  const setTheme = (newTheme: ThemePreference): void => {
    setAppearanceSetting("theme", newTheme);
  };

  const toggleTheme = (): void => {
    setTheme(effectiveTheme() === "dark" ? "light" : "dark");
  };

  // ── Register theme command ──
  registerCommand({
    id: "app.toggleTheme",
    label: "Toggle Theme",
    execute: () => toggleTheme(),
  });
  addKeybinding({
    keys: "$mod+Shift+KeyT",
    commandId: "app.toggleTheme",
  });
  onCleanup(() => {
    unregisterCommand("app.toggleTheme");
    removeKeybinding("$mod+Shift+KeyT");
  });

  return {
    preference,
    effectiveTheme,
    setTheme,
    toggleTheme,
  };
}

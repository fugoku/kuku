import { createStore, reconcile } from "solid-js/store";

// ── Types ──

export type ThemePreference = "system" | "light" | "dark";
export type EffectiveTheme = "light" | "dark";

interface GeneralSettings {
  language: string;
  autoSave: boolean;
  spellCheck: boolean;
}

interface AppearanceSettings {
  theme: ThemePreference;
  /** UI font — CSS font-family name, e.g. "Goorm Sans" */
  fontFamily: string;
}

interface EditorSettings {
  tabSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  /** General font for the editor — CSS font-family name, e.g. "Goorm Sans" */
  fontFamily: string;
  /** Monospace font for the editor — CSS font-family name, e.g. "Goorm Sans Code" */
  fontMono: string;
}

interface FilesSettings {
  newFileLocation: string;
  deletedFiles: string;
}

interface KeybindingsSettings {
  /** commandId → custom key combo (tinykeys format) */
  overrides: Record<string, string>;
}

interface Settings {
  general: GeneralSettings;
  appearance: AppearanceSettings;
  editor: EditorSettings;
  files: FilesSettings;
  keybindings: KeybindingsSettings;
}

// ── Defaults ──

const DEFAULTS: Settings = {
  general: {
    language: "en",
    autoSave: true,
    spellCheck: false,
  },
  appearance: {
    theme: "system",
    fontFamily: "Goorm Sans",
  },
  editor: {
    tabSize: 2,
    wordWrap: true,
    lineNumbers: false,
    fontFamily: "Goorm Sans",
    fontMono: "Goorm Sans Code",
  },
  files: {
    newFileLocation: "root",
    deletedFiles: "trash",
  },
  keybindings: {
    overrides: {},
  },
};

// ── Persistence ──

const STORE_KEY = "app-settings";

function loadSettingsSync(): Settings {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return structuredClone(DEFAULTS);
  try {
    const saved = JSON.parse(raw) as Partial<Settings>;
    return {
      general: { ...DEFAULTS.general, ...saved.general },
      appearance: { ...DEFAULTS.appearance, ...saved.appearance },
      editor: { ...DEFAULTS.editor, ...saved.editor },
      files: { ...DEFAULTS.files, ...saved.files },
      keybindings: { ...DEFAULTS.keybindings, ...saved.keybindings },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function saveSettingsSync(): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(settingsState));
}

// ── Store ──

const [settingsState, setSettingsState] = createStore<Settings>(loadSettingsSync());

// ── Setters ──

function setSetting<S extends keyof Settings, K extends keyof Settings[S]>(
  section: S,
  key: K,
  value: Settings[S][K],
): void {
  //
  (setSettingsState as (s: S, k: K, v: Settings[S][K]) => void)(section, key, value);
  saveSettingsSync();
}

function setGeneralSetting<K extends keyof GeneralSettings>(
  key: K,
  value: GeneralSettings[K],
): void {
  setSetting("general", key, value);
}

function setAppearanceSetting<K extends keyof AppearanceSettings>(
  key: K,
  value: AppearanceSettings[K],
): void {
  setSetting("appearance", key, value);
}

function setEditorSetting<K extends keyof EditorSettings>(key: K, value: EditorSettings[K]): void {
  setSetting("editor", key, value);
}

function setFilesSetting<K extends keyof FilesSettings>(key: K, value: FilesSettings[K]): void {
  setSetting("files", key, value);
}

/** Reset all settings to defaults. */
function resetSettings(): void {
  const defaults = structuredClone(DEFAULTS);
  setSettingsState("general", defaults.general);
  setSettingsState("appearance", defaults.appearance);
  setSettingsState("editor", defaults.editor);
  setSettingsState("files", defaults.files);
  setSettingsState("keybindings", defaults.keybindings);
  saveSettingsSync();
}

function setKeybindingOverride(commandId: string, keys: string): void {
  setSetting("keybindings", "overrides", {
    ...settingsState.keybindings.overrides,
    [commandId]: keys,
  });
}

function resetKeybindingOverride(commandId: string): void {
  const rest = Object.fromEntries(
    Object.entries(settingsState.keybindings.overrides).filter(([key]) => key !== commandId),
  );
  setSettingsState("keybindings", "overrides", reconcile(rest));
  saveSettingsSync();
}

// ── Exports ──

export {
  DEFAULTS as SETTING_DEFAULTS,
  resetSettings,
  setAppearanceSetting,
  setEditorSetting,
  setFilesSetting,
  setGeneralSetting,
  setKeybindingOverride,
  resetKeybindingOverride,
  setSetting,
  settingsState,
};
export type {
  AppearanceSettings,
  EditorSettings,
  FilesSettings,
  GeneralSettings,
  KeybindingsSettings,
  Settings,
};

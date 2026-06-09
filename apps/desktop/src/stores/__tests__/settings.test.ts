import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

class StorageMock {
  readonly #store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#store.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.#store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#store.set(key, value);
  }
}

function installBrowserGlobals(): StorageMock {
  const storage = new StorageMock();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  return storage;
}

async function loadSettingsModule() {
  vi.resetModules();
  return import("~/stores/settings");
}

describe("settings store plugin defaults", () => {
  beforeEach(() => {
    installBrowserGlobals();
    mockInvoke.mockReset();
  });

  it("defaults Second Brain to disabled", async () => {
    const { settingsState } = await loadSettingsModule();

    expect(settingsState.disabledPlugins).toContain("knowledge");
  });

  it("disables Second Brain for previously enabled persisted settings", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === "app_settings_get") {
        return {
          disabled_plugins: ["voxel-graph"],
          disabled_plugin_defaults_applied: ["voxel-graph"],
        };
      }
      if (command === "app_settings_set") return undefined;
      throw new Error(`unexpected invoke: ${command}`);
    });

    const { initSettings, settingsState } = await loadSettingsModule();

    await initSettings();

    expect(settingsState.disabledPlugins).toEqual(["voxel-graph", "knowledge"]);
    expect(settingsState.disabledPluginDefaultsApplied).toEqual(["voxel-graph", "knowledge"]);
    expect(mockInvoke).toHaveBeenCalledWith(
      "app_settings_set",
      expect.objectContaining({
        settings: expect.objectContaining({
          disabled_plugins: ["voxel-graph", "knowledge"],
          disabled_plugin_defaults_applied: ["voxel-graph", "knowledge"],
        }),
      }),
    );
  });
});

import { createMemo, createSignal, For, Show, type JSX } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

import {
  SettingsBanner,
  SettingsListRow,
  SettingsPanel,
  SettingsStatusBadge,
  SettingsToolbarAction,
} from "~/components/settings/settings_blocks";
import { Switch } from "~/components/ui";
import { getPlugin, getPluginDisplayOrder, registryState } from "~/plugins/registry";
import type { PluginMeta } from "~/plugins/types";
import { setTopLevelSetting, settingsState } from "~/stores/settings";

function PluginsSection(): JSX.Element {
  const [isRestarting, setIsRestarting] = createSignal(false);
  const plugins = createMemo(() => {
    const order = getPluginDisplayOrder();
    const ordered = order
      .map((id) => registryState.plugins[id])
      .filter((plugin): plugin is NonNullable<typeof plugin> => plugin !== undefined);

    const known = new Set(ordered.map((plugin) => plugin.id));
    const remainder = Object.values(registryState.plugins).filter(
      (plugin) => !known.has(plugin.id),
    );

    return [...ordered, ...remainder];
  });

  const isDisabled = (pluginId: string, canDisable: boolean) =>
    canDisable && settingsState.disabledPlugins.includes(pluginId);

  function setPluginDisabled(pluginId: string, canDisable: boolean, disabled: boolean): void {
    if (!canDisable) return;

    const next = disabled
      ? [...new Set([...settingsState.disabledPlugins, pluginId])]
      : settingsState.disabledPlugins.filter((id) => id !== pluginId);

    setTopLevelSetting("disabledPlugins", next);
  }

  function pluginStatus(plugin: PluginMeta): {
    label: string;
    tone: "neutral" | "success" | "error";
  } {
    const disabled = isDisabled(plugin.id, plugin.canDisable);

    if (plugin.id in registryState.failed) {
      return { label: "Failed", tone: "error" };
    }

    if (disabled) {
      return { label: "Disabled next launch", tone: "neutral" };
    }

    if (!plugin.canDisable) {
      return { label: "Required", tone: "neutral" };
    }

    if (registryState.activated.includes(plugin.id)) {
      return { label: "Active", tone: "success" };
    }

    return { label: "Inactive", tone: "neutral" };
  }

  async function restartApp(): Promise<void> {
    if (isRestarting()) return;

    setIsRestarting(true);

    try {
      await invoke("app_restart");
    } catch {
      setIsRestarting(false);
    }
  }

  return (
    <SettingsPanel
      title="Plugins"
      description="Enable or disable plugins and inspect their current load status. Changes apply on next app launch."
      anchor="plugins"
      action={
        <SettingsToolbarAction disabled={isRestarting()} onClick={() => void restartApp()}>
          {isRestarting() ? "Restarting..." : "Restart"}
        </SettingsToolbarAction>
      }
    >
      <SettingsBanner
        tone="info"
        description="Plugins are grouped by whether they can be disabled. Each group keeps dependency order internally."
      />

      <div class="space-y-2">
        <Show
          when={plugins().length > 0}
          fallback={<SettingsBanner tone="info" description="No plugins registered." />}
        >
          <For each={plugins()}>
            {(plugin) => {
              const isFailed = () => plugin.id in registryState.failed;
              const failedInfo = () => registryState.failed[plugin.id];
              const disabled = () => isDisabled(plugin.id, plugin.canDisable);
              const status = () => pluginStatus(plugin);
              const dependencies = () => getPlugin(plugin.id)?.dependencies ?? [];

              return (
                <SettingsListRow
                  title={plugin.name}
                  description={
                    <>
                      <span class="text-text-muted">
                        {plugin.description ?? "No description provided."}
                      </span>
                      <span class="ml-2 text-text-muted">v{plugin.version}</span>
                      <Show when={dependencies().length}>
                        <span class="ml-2 text-text-muted">
                          Depends on {dependencies().join(", ")}
                        </span>
                      </Show>
                      <Show when={isFailed()}>
                        <span class="mt-1 block text-error">Error: {failedInfo()?.error}</span>
                      </Show>
                    </>
                  }
                  meta={
                    <SettingsStatusBadge tone={status().tone}>{status().label}</SettingsStatusBadge>
                  }
                  action={
                    <Switch
                      checked={!disabled()}
                      disabled={!plugin.canDisable}
                      onChange={(enabled) =>
                        setPluginDisabled(plugin.id, plugin.canDisable, !enabled)
                      }
                    />
                  }
                />
              );
            }}
          </For>
        </Show>
      </div>
    </SettingsPanel>
  );
}

export { PluginsSection };

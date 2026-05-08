import { For, Show, type JSX } from "solid-js";

import {
  SettingsBanner,
  SettingsListRow,
  SettingsStatusBadge,
  SettingsToolbarAction,
} from "~/components/settings/settings_blocks";
import { t } from "~/i18n";
import { openTab } from "~/stores/files";

import { syncConflicts } from "./status_store";

function formatTimestamp(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString();
}

function baseName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function openConflictCopy(path: string): void {
  openTab(baseName(path), path, "editor");
}

function ConflictList(): JSX.Element {
  return (
    <Show
      when={syncConflicts.length > 0}
      fallback={
        <SettingsBanner tone="success" description={t("settings.plugin.sync.conflicts.empty")} />
      }
    >
      <div class="space-y-2">
        <For each={syncConflicts}>
          {(conflict) => (
            <SettingsListRow
              title={<span class="break-all">{conflict.path}</span>}
              description={
                <span class="break-all">
                  {t("settings.plugin.sync.conflicts.copy_prefix")} {conflict.conflictPath}
                </span>
              }
              meta={<SettingsStatusBadge tone="info">{conflict.status}</SettingsStatusBadge>}
              action={
                <div class="flex flex-col items-end gap-1">
                  <SettingsToolbarAction onClick={() => openConflictCopy(conflict.conflictPath)}>
                    {t("settings.plugin.sync.conflicts.open_copy")}
                  </SettingsToolbarAction>
                  <span class="text-[0.6875rem] whitespace-nowrap text-text-muted">
                    {formatTimestamp(conflict.createdAtMs)}
                  </span>
                </div>
              }
            />
          )}
        </For>
      </div>
    </Show>
  );
}

export { ConflictList };

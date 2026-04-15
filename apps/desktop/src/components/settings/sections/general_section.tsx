import { createSignal } from "solid-js";

import {
  SettingsFieldRow,
  SettingsPanel,
  SettingsStatusBadge,
  SettingsToolbarAction,
  SettingsCard,
} from "~/components/settings/settings_blocks";
import { settingsState } from "~/stores/settings";
import { clearConfiguredVault, selectVault } from "~/stores/vault";

function VaultFolderControl() {
  const [isBusy, setIsBusy] = createSignal(false);
  const configuredPath = () => settingsState.lastOpenedVault;
  const hasConfiguredPath = () => Boolean(configuredPath());

  const browseForVault = async () => {
    if (isBusy()) return;

    setIsBusy(true);
    try {
      await selectVault();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[Settings] Failed to open selected vault", error);
    } finally {
      setIsBusy(false);
    }
  };

  const clearVaultFolder = async () => {
    if (isBusy() || !configuredPath()) return;

    setIsBusy(true);
    try {
      await clearConfiguredVault();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[Settings] Failed to clear configured vault", error);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div class="flex flex-col gap-2">
      <SettingsCard
        tone="subtle"
        title="Current path"
        titleClass="text-[0.6875rem]"
        action={
          <SettingsStatusBadge tone={hasConfiguredPath() ? "success" : "neutral"}>
            {hasConfiguredPath() ? "Configured" : "Missing"}
          </SettingsStatusBadge>
        }
      >
        <p class="font-mono text-[0.75rem]/5 break-all text-text-secondary">
          {configuredPath() ?? "Not configured"}
        </p>
      </SettingsCard>

      <div class="flex flex-wrap gap-2">
        <SettingsToolbarAction disabled={isBusy()} onClick={() => void browseForVault()}>
          {isBusy() ? "Working..." : "Browse..."}
        </SettingsToolbarAction>
        <SettingsToolbarAction
          disabled={isBusy() || !configuredPath()}
          onClick={() => void clearVaultFolder()}
        >
          Clear
        </SettingsToolbarAction>
      </div>
    </div>
  );
}

function GeneralSection() {
  return (
    <SettingsPanel title="General" description="Configure the active vault." anchor="general">
      <SettingsFieldRow
        stacked
        label="Vault folder"
        description="Choose the folder used as the current vault. Changes apply immediately."
        control={<VaultFolderControl />}
      />
    </SettingsPanel>
  );
}

export { GeneralSection };

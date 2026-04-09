import { createSignal } from "solid-js";

import { chooseVaultDirectory } from "~/lib/vault_fs";
import SettingItem from "~/components/settings/setting_item";
import SettingSection from "~/components/settings/setting_section";
import { Select } from "~/components/ui";
import { setGeneralSetting, settingsState } from "~/stores/settings";
import { clearConfiguredVault, openVault } from "~/stores/vault";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ko", label: "한국어" },
  { value: "ja", label: "日本語" },
];

function VaultFolderControl() {
  const [isBusy, setIsBusy] = createSignal(false);
  const configuredPath = () => settingsState.lastOpenedVault;

  const browseForVault = async () => {
    if (isBusy()) return;

    setIsBusy(true);
    try {
      const selected = await chooseVaultDirectory();
      if (!selected) return;
      await openVault(selected);
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
      <div class="rounded-xs border border-border bg-bg-primary px-3 py-2">
        <p class="text-[0.6875rem] font-medium tracking-wider text-text-muted uppercase">
          Current path
        </p>
        <p
          class="mt-1 font-mono text-xs/5 break-all"
          classList={{
            "text-text-secondary": Boolean(configuredPath()),
            "text-text-muted": !configuredPath(),
          }}
        >
          {configuredPath() ?? "Not configured"}
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-xs border border-border px-3 py-2 text-[0.8125rem] text-text-secondary transition-colors hover:bg-ghost-hover hover:text-text-primary disabled:cursor-default disabled:opacity-60"
          disabled={isBusy()}
          onClick={() => void browseForVault()}
        >
          {isBusy() ? "Working..." : "Browse..."}
        </button>
        <button
          type="button"
          class="rounded-xs border border-border px-3 py-2 text-[0.8125rem] text-text-secondary transition-colors hover:bg-ghost-hover hover:text-text-primary disabled:cursor-default disabled:opacity-60"
          disabled={isBusy() || !configuredPath()}
          onClick={() => void clearVaultFolder()}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function GeneralSection() {
  return (
    <SettingSection title="General" anchor="general">
      <SettingItem
        label="Vault folder"
        description="Choose the folder used as the current vault. Changes apply immediately."
      >
        <VaultFolderControl />
      </SettingItem>
      <SettingItem
        label="Language (WIP)"
        description="Select the display language for the interface."
      >
        <Select
          options={LANGUAGE_OPTIONS}
          value={settingsState.general.language}
          onChange={(value) => setGeneralSetting("language", value)}
          placeholder="Select language"
        />
      </SettingItem>
    </SettingSection>
  );
}

export { GeneralSection };

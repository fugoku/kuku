import { createEffect, createMemo, createSignal, For, on, Show, type JSX } from "solid-js";

import {
  SettingsBanner,
  SettingsCard,
  SettingsInput,
  SettingsMetricRow,
  SettingsPanel,
  SettingsStatusBadge,
  SettingsToolbarAction,
} from "~/components/settings/settings_blocks";
import { useSettingsRefreshToken } from "~/components/settings/settings_refresh";
import { t } from "~/i18n";
import { authState, getAuthService } from "~/plugins/builtin/core_auth/auth_service";
import { vaultState } from "~/stores/vault";

import { ConflictList } from "./conflict_list";
import { defaultVaultId, mapSyncError } from "./service";
import { refreshSyncStatus, syncStatus } from "./status_store";
import { getSyncService } from "./runtime";
import { transferStatusLabel } from "./transfer_status";
import type { SyncErrorCategory, SyncRuntimeStatus } from "./types";

function formatTimestamp(ts?: number): string {
  if (!ts) return t("settings.plugin.sync.metrics.never");
  return new Date(ts).toLocaleString();
}

function hasPendingWork(status: SyncRuntimeStatus): boolean {
  return status.pendingUploads > 0 || status.pendingDownloads > 0;
}

function basename(path?: string | null): string {
  const trimmed = path?.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? trimmed;
}

function phaseLabel(status: SyncRuntimeStatus): string {
  if (status.phase === "idle" && hasPendingWork(status)) {
    return t("sync.indicator.pending");
  }

  const phase = status.phase;
  switch (phase) {
    case "notConfigured":
      return t("settings.plugin.sync.phase.not_configured");
    case "disabled":
      return t("settings.plugin.sync.phase.disabled");
    case "planning":
      return t("settings.plugin.sync.phase.planning");
    case "packing":
      return t("settings.plugin.sync.phase.packing");
    case "transferring":
      return t("settings.plugin.sync.phase.transferring");
    case "publishing":
      return t("settings.plugin.sync.phase.publishing");
    case "applying":
      return t("settings.plugin.sync.phase.applying");
    case "error":
      return t("settings.plugin.sync.phase.error");
    default:
      return t("settings.plugin.sync.phase.idle");
  }
}

function phaseTone(status: SyncRuntimeStatus): "neutral" | "success" | "info" | "error" {
  const phase = status.phase;
  if (phase === "error") return "error";
  if (phase === "disabled" || phase === "notConfigured") return "neutral";
  if (phase === "idle" && hasPendingWork(status)) return "neutral";
  if (phase === "idle") return "success";
  return "info";
}

function errorCopy(error: unknown, category?: SyncErrorCategory): string | null {
  if (!error && !category) return null;
  switch (category ?? mapSyncError(error)) {
    case "loginRequired":
      return t("settings.plugin.sync.error.auth_required");
    case "permissionRequired":
      return t("settings.plugin.sync.error.permission_required");
    case "syncDisabled":
      return t("settings.plugin.sync.error.sync_disabled");
    case "notConfigured":
      return t("settings.plugin.sync.error.not_configured");
    case "offline":
      return t("settings.plugin.sync.error.offline");
    case "passphraseFailed":
      return t("settings.plugin.sync.error.passphrase");
    case "quotaExceeded":
      return t("settings.plugin.sync.error.quota");
    case "server":
      return t("settings.plugin.sync.error.server");
    default:
      return t("settings.plugin.sync.error.unknown");
  }
}

function SyncSettings(): JSX.Element {
  const settingsRefreshToken = useSettingsRefreshToken();
  const [recoveryPhrase, setRecoveryPhrase] = createSignal("");
  const [showRecoveryPhrase, setShowRecoveryPhrase] = createSignal(false);
  const [recoveryPhraseCopied, setRecoveryPhraseCopied] = createSignal(false);
  const [recoveryPhraseSaving, setRecoveryPhraseSaving] = createSignal(false);
  const [recoveryPhraseBackedUp, setRecoveryPhraseBackedUp] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [localError, setLocalError] = createSignal<string | null>(null);
  const [confirmDisable, setConfirmDisable] = createSignal(false);
  const [authMode, setAuthMode] = createSignal<"ready" | "loginRequired" | "permissionRequired">(
    "ready",
  );

  async function refresh(options?: { reloadAuth?: boolean }): Promise<void> {
    const service = getSyncService();
    if (!service) return;
    setLocalError(null);
    await refreshSyncStatus(service, { scanLocal: true });
    if (options?.reloadAuth) {
      setAuthMode(await service.authState());
    }
    if (syncStatus.accountKeyId && !recoveryPhrase()) {
      const savedRecoveryPhrase = await service
        .getSavedRecoveryPhrase(syncStatus.accountKeyId)
        .catch(() => null);
      if (savedRecoveryPhrase) {
        setRecoveryPhrase(savedRecoveryPhrase);
      }
    }
    if (!syncStatus.accountKeyId && !recoveryPhrase()) {
      const generated = await service.generateRecoveryPhrase().catch(() => null);
      if (generated) {
        setRecoveryPhrase(generated);
      }
    }
  }

  createEffect(
    on(
      settingsRefreshToken,
      () => {
        void refresh({ reloadAuth: true });
      },
      { defer: false },
    ),
  );

  async function configure(): Promise<boolean> {
    const service = getSyncService();
    const rootPath = vaultState.rootPath;
    if (!service || !rootPath) {
      setLocalError(t("settings.plugin.sync.error.vault_required"));
      return false;
    }
    if (!syncStatus.configured && !recoveryPhrase().trim()) {
      setLocalError(t("settings.plugin.sync.error.passphrase_required"));
      return false;
    }
    if (requiresRecoveryBackup() && !recoveryPhraseBackedUp()) {
      setLocalError(t("settings.plugin.sync.error.recovery_backup_required"));
      return false;
    }

    const status = await service.configureVault({
      vaultId: syncStatus.vaultId ?? defaultVaultId(rootPath),
      rootPath,
      accountKeyId: syncStatus.accountKeyId,
      remoteWorkspaceId: syncStatus.configured ? (syncStatus.remoteWorkspaceId ?? "") : "",
      workspaceName: syncStatus.workspaceName ?? basename(rootPath),
      deviceId: syncStatus.deviceId ?? "",
      deviceName: syncStatus.deviceName,
      rememberWorkspaceKey: true,
      passphrase: recoveryPhrase().trim() || undefined,
    });
    setLocalError(null);
    await refreshSyncStatus(service, { scanLocal: true });
    return status.configured;
  }

  async function handleEnable(): Promise<void> {
    const service = getSyncService();
    if (!service || busy()) return;
    setBusy(true);
    try {
      const configured = syncStatus.configured || (await configure());
      if (!configured) return;
      await service.setEnabled(true);
      await refreshSyncStatus(service, { scanLocal: true });
    } catch (error) {
      setLocalError(errorCopy(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(): Promise<void> {
    const service = getSyncService();
    if (!service || busy()) return;
    if (!confirmDisable()) {
      setConfirmDisable(true);
      window.setTimeout(() => setConfirmDisable(false), 3000);
      return;
    }

    setBusy(true);
    try {
      await service.setEnabled(false);
      setConfirmDisable(false);
      await refreshSyncStatus(service, { scanLocal: true });
    } catch (error) {
      setLocalError(errorCopy(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncNow(): Promise<void> {
    const service = getSyncService();
    if (!service || busy()) return;
    setBusy(true);
    try {
      await service.runOnce(recoveryPhrase().trim() || undefined);
      await refreshSyncStatus(service, { scanLocal: true });
    } catch (error) {
      setLocalError(errorCopy(error));
    } finally {
      setBusy(false);
    }
  }

  const canSyncNow = () => syncStatus.configured && syncStatus.enabled && !busy();
  const visibleError = () =>
    localError() ?? errorCopy(syncStatus.lastError, syncStatus.lastErrorCategory);
  const recoveryPhraseWords = createMemo(() =>
    recoveryPhrase().trim().split(/\s+/).filter(Boolean),
  );
  const requiresRecoveryBackup = () => !syncStatus.configured && !syncStatus.accountKeyId;

  async function generateRecoveryPhrase(): Promise<void> {
    const service = getSyncService();
    if (!service || busy()) return;
    setBusy(true);
    try {
      const generated = await service.generateRecoveryPhrase();
      setRecoveryPhrase(generated);
      setShowRecoveryPhrase(true);
      setRecoveryPhraseBackedUp(false);
      setLocalError(null);
    } catch (error) {
      setLocalError(errorCopy(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyRecoveryPhrase(): Promise<void> {
    const phrase = recoveryPhrase().trim();
    if (!phrase) return;
    try {
      await navigator.clipboard.writeText(phrase);
      setRecoveryPhraseCopied(true);
      window.setTimeout(() => setRecoveryPhraseCopied(false), 1500);
    } catch {
      setLocalError(t("settings.plugin.sync.error.unknown"));
    }
  }

  async function saveRecoveryPhrase(): Promise<void> {
    const service = getSyncService();
    const phrase = recoveryPhrase().trim();
    if (!service || !phrase || recoveryPhraseSaving()) return;
    setRecoveryPhraseSaving(true);
    try {
      const saved = await service.saveRecoveryPhraseFile(phrase);
      if (saved) {
        setRecoveryPhraseBackedUp(true);
      }
    } catch (error) {
      setLocalError(errorCopy(error));
    } finally {
      setRecoveryPhraseSaving(false);
    }
  }

  return (
    <SettingsPanel
      title={t("settings.plugin.sync.title")}
      description={t("settings.plugin.sync.description")}
    >
      <Show when={!authState.authenticated || authMode() !== "ready"}>
        <SettingsBanner
          tone="warning"
          title={t("settings.plugin.sync.auth.title")}
          description={
            authMode() === "permissionRequired"
              ? t("settings.plugin.sync.auth.permission")
              : t("settings.plugin.sync.auth.login")
          }
          action={
            <SettingsToolbarAction
              variant="primary"
              disabled={authState.loading}
              onClick={() => void getAuthService()?.login()}
            >
              {authState.loading
                ? t("settings.plugin.account.action.opening")
                : t("settings.plugin.account.action.sign_in")}
            </SettingsToolbarAction>
          }
        />
      </Show>

      <Show when={!vaultState.rootPath}>
        <SettingsBanner tone="info" description={t("settings.plugin.sync.error.vault_required")} />
      </Show>

      <Show when={visibleError()}>
        {(message) => <SettingsBanner tone="error" description={message()} />}
      </Show>

      <SettingsCard
        tone={syncStatus.enabled ? "muted" : "subtle"}
        description={
          syncStatus.enabled
            ? t("settings.plugin.sync.enable.enabled_description")
            : t("settings.plugin.sync.enable.disabled_description")
        }
        action={
          <div class="flex flex-wrap justify-end gap-2">
            <SettingsToolbarAction
              variant="primary"
              disabled={!canSyncNow()}
              onClick={() => void handleSyncNow()}
            >
              {busy()
                ? t("settings.plugin.sync.action.working")
                : t("settings.plugin.sync.action.sync_now")}
            </SettingsToolbarAction>
            <Show
              when={syncStatus.enabled}
              fallback={
                <SettingsToolbarAction
                  variant="primary"
                  disabled={busy()}
                  onClick={() => void handleEnable()}
                >
                  {busy()
                    ? t("settings.plugin.sync.action.working")
                    : t("settings.plugin.sync.action.enable")}
                </SettingsToolbarAction>
              }
            >
              <SettingsToolbarAction
                variant={confirmDisable() ? "destructive" : "warning"}
                disabled={busy()}
                onClick={() => void handleDisable()}
              >
                {confirmDisable()
                  ? t("settings.plugin.sync.action.confirm_disable")
                  : t("settings.plugin.sync.action.disable")}
              </SettingsToolbarAction>
            </Show>
          </div>
        }
      >
        <div class="text-[0.6875rem] text-text-muted">{t("settings.plugin.sync.enable.help")}</div>
      </SettingsCard>

      <SettingsCard
        title={t("settings.plugin.sync.status.title")}
        tone="subtle"
        action={
          <SettingsStatusBadge tone={phaseTone(syncStatus)}>
            {phaseLabel(syncStatus)}
          </SettingsStatusBadge>
        }
      >
        <div class="space-y-1.5">
          <SettingsMetricRow
            label={t("settings.plugin.sync.metrics.vault")}
            value={
              syncStatus.vaultName ||
              basename(syncStatus.rootPath ?? vaultState.rootPath) ||
              t("settings.plugin.sync.metrics.none")
            }
            valueClass="max-w-80 truncate text-right"
          />
          <SettingsMetricRow
            label={t("settings.plugin.sync.metrics.workspace")}
            value={syncStatus.workspaceName ?? t("settings.plugin.sync.metrics.none")}
            valueClass="max-w-80 truncate text-right"
          />
          <SettingsMetricRow
            label={t("settings.plugin.sync.metrics.device")}
            value={syncStatus.deviceName ?? t("settings.plugin.sync.metrics.none")}
            valueClass="max-w-80 truncate text-right"
          />
          <SettingsMetricRow
            label={t("settings.plugin.sync.metrics.last_synced")}
            value={formatTimestamp(syncStatus.lastSyncedAtMs)}
          />
          <SettingsMetricRow
            label={t("settings.plugin.sync.metrics.transfer")}
            value={transferStatusLabel(syncStatus.transfer)}
          />
          <SettingsMetricRow
            label={t("settings.plugin.sync.metrics.conflicts")}
            value={String(syncStatus.conflictCount)}
          />
          <SettingsMetricRow
            label={t("settings.plugin.sync.metrics.pending")}
            value={`${syncStatus.pendingUploads} / ${syncStatus.pendingDownloads}`}
          />
        </div>
      </SettingsCard>

      <SettingsCard
        title={t("settings.plugin.sync.passphrase.label")}
        description={
          syncStatus.accountKeyId
            ? t("settings.plugin.sync.passphrase.description")
            : t("settings.plugin.sync.passphrase.create_description")
        }
        tone="subtle"
      >
        <div class="space-y-2">
          <div class="flex flex-wrap gap-2">
            <Show when={!syncStatus.accountKeyId}>
              <SettingsToolbarAction
                disabled={busy()}
                onClick={() => void generateRecoveryPhrase()}
              >
                {t("settings.plugin.sync.passphrase.generate")}
              </SettingsToolbarAction>
            </Show>
            <SettingsToolbarAction
              disabled={!recoveryPhrase().trim()}
              onClick={() => void copyRecoveryPhrase()}
            >
              {recoveryPhraseCopied()
                ? t("settings.plugin.sync.passphrase.copied")
                : t("settings.plugin.sync.passphrase.copy")}
            </SettingsToolbarAction>
            <SettingsToolbarAction
              disabled={!recoveryPhrase().trim() || recoveryPhraseSaving()}
              onClick={() => void saveRecoveryPhrase()}
            >
              {t("settings.plugin.sync.passphrase.save")}
            </SettingsToolbarAction>
            <SettingsToolbarAction
              disabled={!recoveryPhrase().trim()}
              onClick={() => setShowRecoveryPhrase((prev) => !prev)}
            >
              {showRecoveryPhrase()
                ? t("settings.plugin.sync.passphrase.hide")
                : t("settings.plugin.sync.passphrase.show")}
            </SettingsToolbarAction>
          </div>
          <Show
            when={showRecoveryPhrase()}
            fallback={
              <SettingsInput
                type="password"
                value={recoveryPhrase()}
                onInput={(event) => {
                  setRecoveryPhrase(event.currentTarget.value);
                  setRecoveryPhraseBackedUp(false);
                }}
                placeholder={t("settings.plugin.sync.passphrase.placeholder")}
                autocomplete="off"
                spellcheck={false}
              />
            }
          >
            <Show
              when={!syncStatus.accountKeyId && recoveryPhraseWords().length > 0}
              fallback={
                <textarea
                  value={recoveryPhrase()}
                  onInput={(event) => {
                    setRecoveryPhrase(event.currentTarget.value);
                    setRecoveryPhraseBackedUp(false);
                  }}
                  placeholder={t("settings.plugin.sync.passphrase.placeholder")}
                  class="min-h-24 w-full resize-y rounded-xs border border-border bg-bg-secondary px-3 py-2 text-[0.75rem] text-text-primary transition-colors outline-none placeholder:text-text-muted focus:border-accent"
                  autocomplete="off"
                  spellcheck={false}
                />
              }
            >
              <div class="grid grid-cols-2 gap-1.5 rounded-xs border border-border/60 bg-bg-secondary p-2 sm:grid-cols-3">
                <For each={recoveryPhraseWords()}>
                  {(word, index) => (
                    <div class="flex items-center gap-2 rounded-xs border border-border/50 bg-bg-primary px-2 py-1.5">
                      <span class="w-5 shrink-0 text-right text-[0.625rem] text-text-muted tabular-nums">
                        {index() + 1}
                      </span>
                      <span class="min-w-0 text-[0.75rem] break-all text-text-primary">{word}</span>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
          <Show when={requiresRecoveryBackup()}>
            <label
              class={[
                "flex cursor-pointer items-start gap-2 rounded-xs border px-3 py-2 text-[0.6875rem] transition-colors",
                recoveryPhraseBackedUp()
                  ? "border-border/70 bg-bg-secondary text-text-primary"
                  : "border-border/60 bg-bg-primary/60 text-text-secondary hover:bg-bg-secondary",
              ].join(" ")}
            >
              <span class="kuku-task-checkbox mt-0.5 text-[0.8125rem]">
                <input
                  type="checkbox"
                  checked={recoveryPhraseBackedUp()}
                  onChange={(event) => setRecoveryPhraseBackedUp(event.currentTarget.checked)}
                  class="kuku-task-checkbox__input"
                />
                <span class="kuku-task-checkbox__control" />
              </span>
              <span class="leading-5">{t("settings.plugin.sync.passphrase.backup_confirm")}</span>
            </label>
          </Show>
        </div>
      </SettingsCard>

      <SettingsCard
        title={t("settings.plugin.sync.conflicts.title")}
        description={t("settings.plugin.sync.conflicts.description")}
        tone="subtle"
      >
        <ConflictList />
      </SettingsCard>
    </SettingsPanel>
  );
}

export { SyncSettings };

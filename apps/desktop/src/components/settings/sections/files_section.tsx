import { createSignal } from "solid-js";

import {
  SettingsFieldRow,
  SettingsPanel,
  SettingsSelect,
  SettingsToolbarAction,
} from "~/components/settings/settings_blocks";
import { setFilesSetting, settingsState } from "~/stores/settings";
import { emptyTrashFolder, openTrashFolder, vaultState } from "~/stores/vault";

const NEW_FILE_LOCATION_OPTIONS = [
  { value: "root", label: "Vault root" },
  { value: "current", label: "Same folder as current file" },
];

const DELETED_FILES_OPTIONS = [
  { value: "trash", label: "Move to system trash" },
  { value: "kuku-trash", label: "Move to .trash folder" },
  { value: "permanent", label: "Delete permanently" },
];

function FilesSection() {
  const [confirmEmptyTrash, setConfirmEmptyTrash] = createSignal(false);

  return (
    <SettingsPanel
      title="Files & Links"
      description="Configure where new files are created and how deletes are handled."
      anchor="files"
    >
      <SettingsFieldRow
        label="Default new file location"
        description="Where new files are created by default."
        control={
          <div class="w-64">
            <SettingsSelect
              options={NEW_FILE_LOCATION_OPTIONS}
              value={settingsState.files.newFileLocation}
              onChange={(value) => setFilesSetting("newFileLocation", value)}
              placeholder="Select location"
            />
          </div>
        }
      />
      <SettingsFieldRow
        label="Deleted files"
        description="Choose whether deletes go to the system trash, Kuku's hidden .trash folder, or are removed permanently."
        control={
          <div class="w-64">
            <SettingsSelect
              options={DELETED_FILES_OPTIONS}
              value={settingsState.files.deletedFiles}
              onChange={(value) => setFilesSetting("deletedFiles", value)}
              placeholder="Select action"
            />
          </div>
        }
      />
      {settingsState.files.deletedFiles === "kuku-trash" ? (
        <SettingsFieldRow
          label="Kuku trash"
          description={
            confirmEmptyTrash()
              ? "Are you sure? Empty Trash permanently deletes everything currently inside Kuku Trash."
              : "The .trash folder stays hidden from the file tree. Use these actions to open it in Finder or remove its contents."
          }
          control={
            <div class="flex items-center gap-2">
              <SettingsToolbarAction
                disabled={!vaultState.rootPath}
                onClick={() => void openTrashFolder()}
              >
                Open Trash
              </SettingsToolbarAction>
              {confirmEmptyTrash() ? (
                <>
                  <SettingsToolbarAction
                    disabled={!vaultState.rootPath}
                    variant="destructive"
                    onClick={() => {
                      setConfirmEmptyTrash(false);
                      void emptyTrashFolder();
                    }}
                  >
                    Confirm Empty
                  </SettingsToolbarAction>
                  <SettingsToolbarAction onClick={() => setConfirmEmptyTrash(false)}>
                    Cancel
                  </SettingsToolbarAction>
                </>
              ) : (
                <SettingsToolbarAction
                  disabled={!vaultState.rootPath}
                  variant="destructive"
                  onClick={() => setConfirmEmptyTrash(true)}
                >
                  Empty Trash
                </SettingsToolbarAction>
              )}
            </div>
          }
        />
      ) : null}
    </SettingsPanel>
  );
}

export { FilesSection };

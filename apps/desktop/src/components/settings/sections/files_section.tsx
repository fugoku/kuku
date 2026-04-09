import SettingItem from "~/components/settings/setting_item";
import SettingSection from "~/components/settings/setting_section";
import { Select } from "~/components/ui";
import { setFilesSetting, settingsState } from "~/stores/settings";

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
  return (
    <SettingSection title="Files & Links" anchor="files">
      <SettingItem
        label="Default new file location"
        description="Where new files are created by default."
      >
        <Select
          options={NEW_FILE_LOCATION_OPTIONS}
          value={settingsState.files.newFileLocation}
          onChange={(value) => setFilesSetting("newFileLocation", value)}
          placeholder="Select location"
        />
      </SettingItem>
      <SettingItem label="Deleted files (WIP)" description="What happens when you delete a file.">
        <Select
          options={DELETED_FILES_OPTIONS}
          value={settingsState.files.deletedFiles}
          onChange={(value) => setFilesSetting("deletedFiles", value)}
          placeholder="Select action"
        />
      </SettingItem>
    </SettingSection>
  );
}

export { FilesSection };

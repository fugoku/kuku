import SettingItem from "~/components/settings/setting_item";
import SettingSection from "~/components/settings/setting_section";
import { FontInput } from "~/components/settings/font_input";
import { Select } from "~/components/ui";
import { setAppearanceSetting, settingsState } from "~/stores/settings";

const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

function AppearanceSection() {
  return (
    <SettingSection title="Appearance" anchor="appearance">
      <SettingItem label="Theme" description="Choose between light and dark appearance.">
        <Select
          options={THEME_OPTIONS}
          value={settingsState.appearance.theme}
          onChange={(value) => setAppearanceSetting("theme", value as "system" | "light" | "dark")}
          placeholder="Select theme"
        />
      </SettingItem>
      <SettingItem
        label="UI font"
        description="Font used for the interface. Enter a CSS font-family name."
      >
        <FontInput
          value={settingsState.appearance.fontFamily}
          placeholder="e.g. Goorm Sans"
          onCommit={(value) => setAppearanceSetting("fontFamily", value)}
        />
      </SettingItem>
    </SettingSection>
  );
}

export { AppearanceSection };

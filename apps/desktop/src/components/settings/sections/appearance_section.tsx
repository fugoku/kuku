import { FontInput } from "~/components/settings/font_input";
import {
  SettingsFieldRow,
  SettingsPanel,
  SettingsSelect,
} from "~/components/settings/settings_blocks";
import { t } from "~/i18n";
import { setAppearanceSetting, settingsState } from "~/stores/settings";

function AppearanceSection() {
  const themeOptions = [
    { value: "system", label: t("settings.appearance.theme.system") },
    { value: "dark", label: t("settings.appearance.theme.dark") },
    { value: "light", label: t("settings.appearance.theme.light") },
  ];

  return (
    <SettingsPanel
      title={t("settings.appearance.title")}
      description={t("settings.appearance.description")}
      anchor="appearance"
    >
      <SettingsFieldRow
        label={t("settings.appearance.theme.label")}
        description={t("settings.appearance.theme.description")}
        control={
          <div class="w-full max-w-56">
            <SettingsSelect
              options={themeOptions}
              value={settingsState.appearance.theme}
              onChange={(value) =>
                setAppearanceSetting("theme", value as "system" | "light" | "dark")
              }
              placeholder={t("settings.appearance.theme.placeholder")}
            />
          </div>
        }
      />
      <SettingsFieldRow
        label={t("settings.appearance.ui_font.label")}
        description={t("settings.appearance.ui_font.description")}
        control={
          <div class="w-full max-w-70">
            <FontInput
              value={settingsState.appearance.fontFamily}
              placeholder={t("settings.appearance.ui_font.placeholder")}
              onCommit={(value) => setAppearanceSetting("fontFamily", value)}
            />
          </div>
        }
      />
    </SettingsPanel>
  );
}

export { AppearanceSection };

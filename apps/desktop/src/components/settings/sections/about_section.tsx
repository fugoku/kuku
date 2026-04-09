import SettingItem from "~/components/settings/setting_item";
import SettingSection from "~/components/settings/setting_section";

function AboutSection() {
  return (
    <SettingSection title="About" anchor="about">
      <SettingItem label="Version" description="Current application version.">
        <span class="text-[0.8125rem] text-text-secondary">0.0.0-dev</span>
      </SettingItem>
      <SettingItem label="License" description="Open-source license.">
        <span class="text-[0.8125rem] text-text-secondary">MIT</span>
      </SettingItem>
    </SettingSection>
  );
}

export { AboutSection };

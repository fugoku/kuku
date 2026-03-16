import { type Component, createSignal, For } from "solid-js";
import { Dynamic } from "solid-js/web";

import ScrollArea from "~/components/scroll_area";
import SettingItem from "~/components/settings/setting_item";
import SettingSection from "~/components/settings/setting_section";
import { Select, Switch } from "~/components/ui";
import {
  setAppearanceSetting,
  setEditorSetting,
  setFilesSetting,
  setGeneralSetting,
  settingsState,
} from "~/stores/settings";

// ── Types ──

interface NavCategory {
  id: string;
  label: string;
  group?: string;
}

// ── Data ──

const CATEGORIES: NavCategory[] = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "editor", label: "Editor" },
  { id: "files", label: "Files & Links" },
  { id: "keybindings", label: "Keybindings" },
  { id: "plugins", label: "Plugins", group: "Advanced" },
  { id: "about", label: "About", group: "Advanced" },
];

// ── Shared options ──

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ko", label: "한국어" },
  { value: "ja", label: "日本語" },
];

const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

const FONT_FAMILY_OPTIONS = [
  { value: "goorm-sans", label: "Goorm Sans" },
  { value: "system", label: "System Default" },
  { value: "inter", label: "Inter" },
];

const TAB_SIZE_OPTIONS = [
  { value: "2", label: "2" },
  { value: "4", label: "4" },
  { value: "8", label: "8" },
];

const NEW_FILE_LOCATION_OPTIONS = [
  { value: "root", label: "Vault root" },
  { value: "current", label: "Same folder as current file" },
];

const DELETED_FILES_OPTIONS = [
  { value: "trash", label: "Move to system trash" },
  { value: "kuku-trash", label: "Move to .trash folder" },
  { value: "permanent", label: "Delete permanently" },
];

// ── Styles ──

const INPUT_BASE =
  "h-8 w-full rounded-md border border-border bg-bg-primary px-2.5 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-placeholder focus:border-border-focused";

// ── Section Renderers ──

function GeneralSection() {
  return (
    <SettingSection title="General">
      <SettingItem label="Language" description="Select the display language for the interface.">
        <Select
          options={LANGUAGE_OPTIONS}
          value={settingsState.general.language}
          onChange={(v) => setGeneralSetting("language", v)}
          placeholder="Select language"
        />
      </SettingItem>
      <SettingItem label="Auto-save" description="Automatically save changes after editing.">
        <Switch
          checked={settingsState.general.autoSave}
          onChange={(v) => setGeneralSetting("autoSave", v)}
        />
      </SettingItem>
      <SettingItem label="Spell check" description="Check spelling while typing in the editor.">
        <Switch
          checked={settingsState.general.spellCheck}
          onChange={(v) => setGeneralSetting("spellCheck", v)}
        />
      </SettingItem>
    </SettingSection>
  );
}

function AppearanceSection() {
  return (
    <SettingSection title="Appearance">
      <SettingItem label="Theme" description="Choose between light and dark appearance.">
        <Select
          options={THEME_OPTIONS}
          value={settingsState.appearance.theme}
          onChange={(v) => setAppearanceSetting("theme", v as "system" | "light" | "dark")}
          placeholder="Select theme"
        />
      </SettingItem>
      <SettingItem label="Font size" description="Base font size for the interface (px).">
        <input
          type="number"
          class={INPUT_BASE}
          value={settingsState.appearance.fontSize}
          onInput={(e) => {
            const v = Number.parseInt(e.currentTarget.value, 10);
            if (!Number.isNaN(v)) setAppearanceSetting("fontSize", v);
          }}
          min="10"
          max="24"
        />
      </SettingItem>
      <SettingItem label="Font family" description="Font used for the UI and editor.">
        <Select
          options={FONT_FAMILY_OPTIONS}
          value={settingsState.appearance.fontFamily}
          onChange={(v) => setAppearanceSetting("fontFamily", v)}
          placeholder="Select font"
        />
      </SettingItem>
    </SettingSection>
  );
}

function EditorSection() {
  return (
    <SettingSection title="Editor">
      <SettingItem label="Tab size" description="Number of spaces per tab character.">
        <Select
          options={TAB_SIZE_OPTIONS}
          value={String(settingsState.editor.tabSize)}
          onChange={(v) => setEditorSetting("tabSize", Number.parseInt(v, 10))}
          placeholder="Select tab size"
        />
      </SettingItem>
      <SettingItem label="Word wrap" description="Wrap long lines to fit the editor width.">
        <Switch
          checked={settingsState.editor.wordWrap}
          onChange={(v) => setEditorSetting("wordWrap", v)}
        />
      </SettingItem>
      <SettingItem label="Line numbers" description="Show line numbers in the gutter.">
        <Switch
          checked={settingsState.editor.lineNumbers}
          onChange={(v) => setEditorSetting("lineNumbers", v)}
        />
      </SettingItem>
    </SettingSection>
  );
}

function FilesSection() {
  return (
    <SettingSection title="Files & Links">
      <SettingItem
        label="Default new file location"
        description="Where new files are created by default."
      >
        <Select
          options={NEW_FILE_LOCATION_OPTIONS}
          value={settingsState.files.newFileLocation}
          onChange={(v) => setFilesSetting("newFileLocation", v)}
          placeholder="Select location"
        />
      </SettingItem>
      <SettingItem label="Deleted files" description="What happens when you delete a file.">
        <Select
          options={DELETED_FILES_OPTIONS}
          value={settingsState.files.deletedFiles}
          onChange={(v) => setFilesSetting("deletedFiles", v)}
          placeholder="Select action"
        />
      </SettingItem>
    </SettingSection>
  );
}

function KeybindingsSection() {
  return (
    <SettingSection title="Keybindings">
      <SettingItem
        label="Keybinding configuration"
        description="Keybinding customization will be available in a future update."
      >
        <p class="text-[12px] text-text-muted">Coming soon.</p>
      </SettingItem>
    </SettingSection>
  );
}

function PluginsSection() {
  return (
    <SettingSection title="Plugins">
      <SettingItem label="Plugin system" description="The plugin system is under development.">
        <p class="text-[12px] text-text-muted">Coming soon.</p>
      </SettingItem>
    </SettingSection>
  );
}

function AboutSection() {
  return (
    <SettingSection title="About">
      <SettingItem label="Version" description="Current application version.">
        <span class="text-[13px] text-text-secondary">0.0.0-dev</span>
      </SettingItem>
      <SettingItem label="License" description="Open-source license.">
        <span class="text-[13px] text-text-secondary">MIT</span>
      </SettingItem>
    </SettingSection>
  );
}

const SECTION_MAP: Record<string, Component> = {
  general: GeneralSection,
  appearance: AppearanceSection,
  editor: EditorSection,
  files: FilesSection,
  keybindings: KeybindingsSection,
  plugins: PluginsSection,
  about: AboutSection,
};

// ── Nav Button ──

function NavButton(props: { cat: NavCategory; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      class={`flex h-8 w-full cursor-pointer items-center rounded-md border-none px-2.5 text-[13px] leading-normal transition-colors duration-100 ${
        props.active
          ? "bg-ghost-selected text-text-primary"
          : "bg-transparent text-text-secondary hover:bg-ghost-hover hover:text-text-primary"
      }`}
      onClick={props.onClick}
    >
      {props.cat.label}
    </button>
  );
}

// ── Main Component ──

export default function SettingsView() {
  const [activeCategory, setActiveCategory] = createSignal("general");

  const mainCategories = () => CATEGORIES.filter((c) => !c.group);
  const advancedCategories = () => CATEGORIES.filter((c) => c.group === "Advanced");

  const sectionComponent = () => SECTION_MAP[activeCategory()];

  return (
    <div class="flex h-full">
      {/* ── Left Nav ── */}
      <nav class="flex w-45 shrink-0 flex-col border-r border-border bg-bg-secondary py-2">
        <ScrollArea class="flex-1 px-2" axis="y">
          {/* Main categories */}
          <For each={mainCategories()}>
            {(cat) => (
              <NavButton
                cat={cat}
                active={activeCategory() === cat.id}
                onClick={() => setActiveCategory(cat.id)}
              />
            )}
          </For>

          {/* Separator */}
          <div class="m-2 h-px bg-border" />

          {/* Advanced categories */}
          <For each={advancedCategories()}>
            {(cat) => (
              <NavButton
                cat={cat}
                active={activeCategory() === cat.id}
                onClick={() => setActiveCategory(cat.id)}
              />
            )}
          </For>
        </ScrollArea>
      </nav>

      {/* ── Right Content ── */}
      <div class="flex min-w-0 flex-1 flex-col">
        {/* Settings content */}
        <ScrollArea class="min-h-0 flex-1" axis="y" alwaysVisible>
          <div class="mx-auto max-w-140 px-5 py-2">
            <Dynamic component={sectionComponent()} />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

import type { JSX } from "solid-js";

// ── Types ──

interface SettingSectionProps {
  /** Section title displayed as a category header */
  title: string;
  /** Optional stable anchor for deep-link style in-app settings navigation */
  anchor?: string;
  /** SettingItem components */
  children: JSX.Element;
}

// ── Component ──

/**
 * Groups related settings under a category header with a divider.
 *
 * ```tsx
 * <SettingSection title="General">
 *   <SettingItem label="Language" description="Select the display language.">
 *     <select>...</select>
 *   </SettingItem>
 * </SettingSection>
 * ```
 */
export default function SettingSection(props: SettingSectionProps) {
  return (
    <section class="py-2" data-settings-anchor={props.anchor}>
      <h2 class="mb-1 border-b border-border pb-2 text-[0.6875rem] font-medium tracking-wider text-text-muted uppercase">
        {props.title}
      </h2>
      <div class="divide-y divide-border-variant">{props.children}</div>
    </section>
  );
}

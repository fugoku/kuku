import { Switch as KSwitch } from "@kobalte/core/switch";
import { type JSX, splitProps } from "solid-js";

// ── Types ──

interface SwitchProps {
  /** Whether the switch is on */
  checked?: boolean;
  /** Default checked state (uncontrolled) */
  defaultChecked?: boolean;
  /** Called when the checked state changes */
  onChange?: (checked: boolean) => void;
  /** Whether the switch is disabled */
  disabled?: boolean;
  /** Accessible label */
  label?: string;
  /** Form field name */
  name?: string;
  /** Additional class on the root */
  class?: string;
  children?: JSX.Element;
}

// ── Component ──

/**
 * Toggle switch built on Kobalte's Switch primitive.
 * Styled with Tailwind v4 `data-[checked]` selectors.
 *
 * @example
 * ```tsx
 * <Switch checked={enabled()} onChange={setEnabled} label="Auto-save" />
 * ```
 *
 * @example
 * ```tsx
 * <Switch defaultChecked>
 *   <SwitchLabel>Dark mode</SwitchLabel>
 * </Switch>
 * ```
 */
export default function Switch(props: SwitchProps) {
  const [local, rest] = splitProps(props, [
    "checked",
    "defaultChecked",
    "onChange",
    "disabled",
    "label",
    "name",
    "class",
    "children",
  ]);

  return (
    <KSwitch
      checked={local.checked}
      defaultChecked={local.defaultChecked}
      onChange={local.onChange}
      disabled={local.disabled}
      name={local.name}
      class={`inline-flex items-center gap-2 ${local.class ?? ""}`}
      {...rest}
    >
      <KSwitch.Input class="sr-only" />
      <KSwitch.Control
        class={[
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full",
          "bg-element transition-colors duration-200",
          "data-[checked]:bg-accent",
          "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        ].join(" ")}
      >
        <KSwitch.Thumb
          class={[
            "inline-block size-3.5 rounded-full bg-white shadow-sm",
            "transition-transform duration-200",
            "translate-x-0.5 data-[checked]:translate-x-[18px]",
          ].join(" ")}
        />
      </KSwitch.Control>
      {local.label && (
        <KSwitch.Label class="cursor-pointer text-[13px] leading-normal text-text-primary data-disabled:cursor-not-allowed data-disabled:text-text-disabled">
          {local.label}
        </KSwitch.Label>
      )}
      {local.children}
    </KSwitch>
  );
}

/** Re-export Kobalte sub-components for advanced composition */
export const SwitchLabel = KSwitch.Label;
export const SwitchDescription = KSwitch.Description;

import { DropdownMenu as KMenu } from "@kobalte/core/dropdown-menu";
import { type JSX, Show } from "solid-js";

// ── Styled Sub-components ──

/**
 * Root container for the dropdown menu.
 * Controls open/close state and nesting.
 *
 * @example
 * ```tsx
 * <DropdownMenu>
 *   <DropdownMenuTrigger class={ACTION_BTN}>
 *     <EllipsisVerticalIcon />
 *   </DropdownMenuTrigger>
 *   <DropdownMenuContent>
 *     <DropdownMenuItem label="New Tab" shortcut="⌘N" onSelect={newTab} />
 *     <DropdownMenuSeparator />
 *     <DropdownMenuItem label="Settings" shortcut="⌘," onSelect={openSettings} />
 *   </DropdownMenuContent>
 * </DropdownMenu>
 * ```
 */
export function DropdownMenu(props: {
  children: JSX.Element;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <KMenu open={props.open} defaultOpen={props.defaultOpen} onOpenChange={props.onOpenChange}>
      {props.children}
    </KMenu>
  );
}

/**
 * Button that toggles the menu. Renders as a `<button>` by default.
 * Kobalte attaches click, keyboard, and ARIA attributes automatically.
 */
export function DropdownMenuTrigger(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <KMenu.Trigger {...props} />;
}

/**
 * Portaled dropdown content panel with styling.
 * Wraps `KMenu.Portal` + `KMenu.Content`.
 */
export function DropdownMenuContent(props: { children: JSX.Element; class?: string }) {
  return (
    <KMenu.Portal>
      <KMenu.Content
        class={[
          "z-1000 min-w-44 overflow-hidden rounded-lg border border-border bg-bg-secondary p-1",
          "shadow-[0_4px_16px_rgba(0,0,0,0.28),0_0_0_1px_rgba(0,0,0,0.06)]",
          "origin-[var(--kb-menu-content-transform-origin)]",
          props.class ?? "",
        ].join(" ")}
      >
        {props.children}
      </KMenu.Content>
    </KMenu.Portal>
  );
}

/**
 * A single menu item with label and optional keyboard shortcut hint.
 */
export function DropdownMenuItem(props: {
  label: string;
  shortcut?: string;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <KMenu.Item
      onSelect={props.onSelect}
      disabled={props.disabled}
      class={[
        "flex h-8 w-full cursor-pointer items-center justify-between gap-4 rounded-[5px] px-2.5 text-[13px] leading-normal text-text-primary outline-none",
        "transition-colors duration-75",
        "data-highlighted:bg-ghost-hover",
        "data-disabled:cursor-not-allowed data-disabled:text-text-disabled",
      ].join(" ")}
    >
      <span class="whitespace-nowrap">{props.label}</span>
      <Show when={props.shortcut}>
        <span class="text-[11px] text-text-muted">{props.shortcut}</span>
      </Show>
    </KMenu.Item>
  );
}

/**
 * A visual separator between menu items.
 */
export function DropdownMenuSeparator() {
  return <KMenu.Separator class="mx-1.5 my-1 h-px bg-border" />;
}

/**
 * A group label for a section of menu items.
 */
export function DropdownMenuGroupLabel(props: { children: JSX.Element }) {
  return (
    <KMenu.GroupLabel class="px-2.5 py-1.5 text-[11px] font-medium tracking-wider text-text-muted uppercase">
      {props.children}
    </KMenu.GroupLabel>
  );
}

/**
 * A group of related menu items.
 */
export function DropdownMenuGroup(props: { children: JSX.Element }) {
  return <KMenu.Group>{props.children}</KMenu.Group>;
}

import { ContextMenu as KMenu } from "@kobalte/core/context-menu";
import { type JSX, Show, splitProps } from "solid-js";

export function ContextMenu(props: {
  children: JSX.Element;
  onOpenChange?: (open: boolean) => void;
}) {
  return <KMenu onOpenChange={props.onOpenChange}>{props.children}</KMenu>;
}

export function ContextMenuTrigger(props: { children: JSX.Element }) {
  return <KMenu.Trigger>{props.children}</KMenu.Trigger>;
}

function ContextMenuSurface(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, outerProps] = splitProps(props, ["children", "class", "style"]);

  const shadowFilter =
    "drop-shadow(0 10px 28px rgba(0, 0, 0, 0.22)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.08))";

  const style = () =>
    typeof local.style === "string"
      ? `${local.style}; filter: ${shadowFilter};`
      : { ...local.style, filter: shadowFilter };

  return (
    <div
      {...outerProps}
      style={style()}
      class={[
        "z-1000 min-w-44 origin-[var(--kb-menu-content-transform-origin)] outline-none",
        local.class ?? "",
      ].join(" ")}
    >
      <div class="overflow-hidden rounded-xs border border-border bg-bg-secondary p-1">
        {local.children}
      </div>
    </div>
  );
}

export function ContextMenuContent(props: { children: JSX.Element; class?: string }) {
  return (
    <KMenu.Portal>
      <KMenu.Content as={ContextMenuSurface} class={[props.class ?? ""].join(" ")}>
        {props.children}
      </KMenu.Content>
    </KMenu.Portal>
  );
}

export function ContextMenuItem(props: {
  label: string;
  shortcut?: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <KMenu.Item
      onSelect={props.onSelect}
      disabled={props.disabled}
      class={[
        "flex h-8 w-full cursor-pointer items-center justify-between gap-4 rounded-xs px-2.5 text-[0.8125rem] leading-normal outline-none",
        "transition-colors duration-75",
        props.danger
          ? "text-error data-highlighted:bg-error-bg"
          : "text-text-primary data-highlighted:bg-ghost-hover",
        "data-disabled:cursor-not-allowed data-disabled:text-text-disabled",
      ].join(" ")}
    >
      <span class="whitespace-nowrap">{props.label}</span>
      <Show when={props.shortcut}>
        <span class={props.danger ? "text-error/70" : "text-[0.6875rem] text-text-muted"}>
          {props.shortcut}
        </span>
      </Show>
    </KMenu.Item>
  );
}

/**
 * A visual separator between menu items.
 */
export function ContextMenuSeparator() {
  return <KMenu.Separator class="mx-1.5 my-1 h-px bg-border" />;
}

/**
 * A group label for a section of menu items (e.g. "AI Skills").
 */
export function ContextMenuGroupLabel(props: { children: JSX.Element }) {
  return (
    <KMenu.GroupLabel class="px-2.5 py-1.5 text-[0.6875rem] font-medium tracking-wider text-text-muted uppercase">
      {props.children}
    </KMenu.GroupLabel>
  );
}

/**
 * A group of related menu items.
 */
export function ContextMenuGroup(props: { children: JSX.Element }) {
  return <KMenu.Group>{props.children}</KMenu.Group>;
}

/**
 * Root wrapper for a submenu.
 */
export function ContextMenuSub(props: { children: JSX.Element }) {
  return <KMenu.Sub>{props.children}</KMenu.Sub>;
}

/**
 * Trigger item for a submenu. Renders like a regular menu item
 * but displays a right-pointing chevron to indicate a nested menu.
 */
export function ContextMenuSubTrigger(props: { label: string; disabled?: boolean }) {
  return (
    <KMenu.SubTrigger
      disabled={props.disabled}
      class={[
        "flex h-8 w-full cursor-pointer items-center justify-between gap-4 rounded-xs px-2.5 text-[0.8125rem] leading-normal text-text-primary outline-none",
        "transition-colors duration-75",
        "data-highlighted:bg-ghost-hover",
        "data-disabled:cursor-not-allowed data-disabled:text-text-disabled",
      ].join(" ")}
    >
      <span class="whitespace-nowrap">{props.label}</span>
      <span class="text-[0.75rem] text-text-muted">›</span>
    </KMenu.SubTrigger>
  );
}

/**
 * Portaled content panel for a submenu.
 * Uses the same portal + styling as `ContextMenuContent`.
 */
export function ContextMenuSubContent(props: { children: JSX.Element; class?: string }) {
  return (
    <KMenu.Portal>
      <KMenu.SubContent as={ContextMenuSurface} class={[props.class ?? ""].join(" ")}>
        {props.children}
      </KMenu.SubContent>
    </KMenu.Portal>
  );
}

/**
 * Compact icon-only button for use in a formatting toolbar grid
 * inside a context menu.
 */
export function ContextMenuIconButton(props: {
  children: JSX.Element;
  onSelect: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <KMenu.Item
      onSelect={props.onSelect}
      disabled={props.disabled}
      class={[
        "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-xs outline-none",
        "transition-colors duration-75",
        "data-highlighted:bg-ghost-hover",
        "data-disabled:cursor-not-allowed data-disabled:text-text-disabled",
        props.active ? "bg-ghost-hover text-text-primary" : "text-text-secondary",
      ].join(" ")}
      title={props.title}
    >
      {props.children}
    </KMenu.Item>
  );
}

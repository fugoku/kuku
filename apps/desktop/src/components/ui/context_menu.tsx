import { ContextMenu as KMenu } from "@kobalte/core/context-menu";
import { type JSX, Show } from "solid-js";

export function ContextMenu(props: {
  children: JSX.Element;
  onOpenChange?: (open: boolean) => void;
}) {
  return <KMenu onOpenChange={props.onOpenChange}>{props.children}</KMenu>;
}

export function ContextMenuTrigger(props: { children: JSX.Element }) {
  return <KMenu.Trigger>{props.children}</KMenu.Trigger>;
}

export function ContextMenuContent(props: { children: JSX.Element; class?: string }) {
  return (
    <KMenu.Portal>
      <KMenu.Content
        class={[
          "z-1000 min-w-44 overflow-hidden rounded-xs border border-border bg-bg-secondary p-1",
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

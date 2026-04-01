import { createEffect, createSignal, For } from "solid-js";

import { CloseIcon, LinkIcon } from "~/components/icons";
import type { AnchorEditTarget, AnchorEditValues } from "~/plugins/anchor_editors";

interface AnchorEditInputProps {
  target: AnchorEditTarget;
  autoFocus?: boolean;
  onApply: (values: AnchorEditValues) => void;
  onPinnedChange?: (pinned: boolean) => void;
  onClose: () => void;
}

interface AnchorPosition {
  top: number;
  left: number;
}

function computeAnchorPosition(
  rect: DOMRect,
  containerEl: HTMLElement,
  width: number,
): AnchorPosition {
  const containerRect = containerEl.getBoundingClientRect();
  const top = rect.bottom - containerRect.top + 10;
  const maxLeft = Math.max(8, containerRect.width - width - 8);
  return {
    top,
    left: Math.min(maxLeft, Math.max(8, rect.left - containerRect.left)),
  };
}

export default function AnchorEditInput(props: AnchorEditInputProps) {
  let containerRef: HTMLDivElement | undefined;
  let firstInputRef: HTMLInputElement | undefined;
  let syncedTargetId: string | null = null;
  let focusedTargetId: string | null = null;

  const [values, setValues] = createSignal<AnchorEditValues>({});
  const [position, setPosition] = createSignal<AnchorPosition>({ top: 0, left: 0 });

  const width = () => props.target.width ?? (props.target.fields.length > 1 ? 360 : 320);

  createEffect(() => {
    const target = props.target;
    if (target.id === syncedTargetId) return;
    syncedTargetId = target.id;
    setValues(Object.fromEntries(target.fields.map((field) => [field.key, field.value])));
  });

  createEffect(() => {
    const host = containerRef?.parentElement;
    if (!host) return;

    setPosition(computeAnchorPosition(props.target.rect, host, width()));
  });

  createEffect(() => {
    const targetId = props.target.id;
    if (!props.autoFocus || targetId === focusedTargetId) return;
    focusedTargetId = targetId;

    requestAnimationFrame(() => {
      firstInputRef?.focus();
      firstInputRef?.select();
    });
  });

  function handleFocusIn(): void {
    props.onPinnedChange?.(true);
  }

  function handleFocusOut(e: FocusEvent): void {
    const next = e.relatedTarget as Node | null;
    if (!next || !containerRef?.contains(next)) {
      props.onPinnedChange?.(false);
    }
  }

  function updateValue(key: string, value: string): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function submit(): void {
    props.onApply(values());
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      props.onPinnedChange?.(false);
      props.onClose();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const pos = () => position();

  return (
    <div
      ref={containerRef}
      class="pointer-events-none absolute inset-0 z-50"
      style={{ overflow: "visible" }}
    >
      <div
        data-link-editor=""
        class="pointer-events-auto absolute rounded-sm border border-border bg-bg-secondary p-2 shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
        style={{
          top: `${pos().top}px`,
          left: `${pos().left}px`,
          width: `${width()}px`,
        }}
        onFocusIn={handleFocusIn}
        onFocusOut={handleFocusOut}
      >
        <div class="mb-2 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-[0.75rem] text-text-secondary">
            <LinkIcon size={13} />
            <span>{props.target.title}</span>
          </div>
          <button
            type="button"
            class="flex size-5 items-center justify-center rounded-xs border-none bg-transparent p-0 text-text-muted hover:bg-ghost-hover hover:text-text-primary"
            onClick={() => {
              props.onPinnedChange?.(false);
              props.onClose();
            }}
          >
            <CloseIcon size={10} />
          </button>
        </div>

        <div class="space-y-2">
          <For each={props.target.fields}>
            {(field, index) => (
              <>
                <label class="block text-[0.6875rem] tracking-[0.08em] text-text-muted uppercase">
                  {field.label}
                </label>
                <input
                  ref={(el) => {
                    if (index() === 0) {
                      firstInputRef = el;
                    }
                  }}
                  type="text"
                  class="w-full rounded-xs border border-border bg-bg-primary px-2 py-1.5 text-[0.8125rem] text-text-primary outline-none focus:border-border-selected"
                  value={values()[field.key] ?? ""}
                  onInput={(e) => updateValue(field.key, e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={field.placeholder}
                />
              </>
            )}
          </For>
        </div>

        <div class="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            class="rounded-xs border border-border bg-transparent px-2 py-1 text-[0.75rem] text-text-secondary hover:bg-ghost-hover hover:text-text-primary"
            onClick={() => {
              props.onPinnedChange?.(false);
              props.onClose();
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-xs border border-border bg-element px-2 py-1 text-[0.75rem] text-text-primary hover:bg-element-hover"
            onClick={submit}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Custom Selection Highlight ──
//
// Replaces the browser's native `::selection` with ProseMirror inline
// decorations so that selection never paints full-width backgrounds on
// block-level wrapper divs (e.g. nested list containers).
//
// Native `::selection` is suppressed via CSS:
//   .ProseMirror ::selection { background: transparent; color: inherit; }
//
// This plugin renders `.pm-selection` decorations for BOTH focused and
// blurred states, giving us full control over how selections look.
//
// Addressed edge cases:
//   1. rAF timing race — pending blur is cancelled if focus returns first
//   2. Drag-outside blur — mouse-held state suppresses blur style swap
//   3. Stale decorations — selection changes always rebuild decorations
//   4. Performance — decorations only rebuild when selection or doc changes

import { definePlugin, type Extension } from "prosekit/core";
import type { Node } from "prosekit/pm/model";
import { Plugin, PluginKey } from "prosekit/pm/state";
import { Decoration, DecorationSet } from "prosekit/pm/view";

// ── Constants ──

interface SelectionState {
  decorations: DecorationSet;
  focused: boolean;
}

const pluginKey = new PluginKey<SelectionState>("selection-highlight");

/**
 * Transaction metadata key.
 * - `"focus"`  → editor gained focus
 * - `"blur"`   → editor lost focus
 */
const FOCUS_META = "selection-highlight-focus";

/** CSS class applied when the editor is focused. */
const SELECTION_CLASS = "pm-selection";

/** CSS class applied when the editor is blurred (preserves highlight). */
const BLUR_CLASS = "pm-selection-blur";

// ── Helpers ──

/** Build a decoration set for a non-collapsed selection. */
function buildDecorations(doc: Node, from: number, to: number, className: string): DecorationSet {
  if (from === to) return DecorationSet.empty;
  return DecorationSet.create(doc, [Decoration.inline(from, to, { class: className })]);
}

// ── Extension ──

/**
 * Returns a ProseKit Extension that renders custom selection decorations,
 * completely replacing native `::selection` highlighting.
 *
 * Focused state:  `.pm-selection`      — active selection color
 * Blurred state:  `.pm-selection-blur` — dimmed / preserved selection color
 */
function defineBlurSelection(): Extension {
  // ── Mutable state shared between DOM handlers ──

  let pendingBlurRaf: number | null = null;
  let mouseDown = false;

  function cancelPendingBlur(): void {
    if (pendingBlurRaf !== null) {
      cancelAnimationFrame(pendingBlurRaf);
      pendingBlurRaf = null;
    }
  }

  return definePlugin(
    new Plugin<SelectionState>({
      key: pluginKey,

      state: {
        init(_config, state) {
          // Editor starts focused — render active selection decorations
          const { from, to } = state.selection;
          return {
            decorations: buildDecorations(state.doc, from, to, SELECTION_CLASS),
            focused: true,
          };
        },

        apply(tr, prev, _oldState, newState) {
          const focusMeta = tr.getMeta(FOCUS_META) as string | undefined;

          // ── Focus change ──
          if (focusMeta === "focus") {
            const { from, to } = newState.selection;
            return {
              decorations: buildDecorations(newState.doc, from, to, SELECTION_CLASS),
              focused: true,
            };
          }

          if (focusMeta === "blur") {
            const { from, to } = newState.selection;
            return {
              decorations: buildDecorations(newState.doc, from, to, BLUR_CLASS),
              focused: false,
            };
          }

          // ── Selection or doc changed ──
          if (tr.selectionSet || tr.docChanged) {
            const { from, to } = newState.selection;
            const cls = prev.focused ? SELECTION_CLASS : BLUR_CLASS;
            return {
              decorations: buildDecorations(newState.doc, from, to, cls),
              focused: prev.focused,
            };
          }

          return prev;
        },
      },

      props: {
        decorations(state) {
          return pluginKey.getState(state)?.decorations ?? DecorationSet.empty;
        },

        handleDOMEvents: {
          // ── Track mouse state to suppress drag-blur ──

          mousedown(_view, event: MouseEvent) {
            if (event.button === 0) mouseDown = true;
            return false;
          },

          mouseup(_view, event: MouseEvent) {
            if (event.button === 0) mouseDown = false;
            return false;
          },

          // ── Blur / Focus handlers ──

          blur(view) {
            // Don't switch to blur style during a drag — the user is
            // actively selecting and the editor will regain focus on mouseup.
            if (mouseDown) return false;

            cancelPendingBlur();

            // Schedule after the browser finishes processing focus change.
            pendingBlurRaf = requestAnimationFrame(() => {
              pendingBlurRaf = null;

              if (view.isDestroyed || view.hasFocus() || mouseDown) return;

              const { from, to } = view.state.selection;
              if (from === to) return;

              view.dispatch(view.state.tr.setMeta(FOCUS_META, "blur"));
            });

            return false;
          },

          focus(view) {
            cancelPendingBlur();

            const prev = pluginKey.getState(view.state);
            if (prev && !prev.focused) {
              view.dispatch(view.state.tr.setMeta(FOCUS_META, "focus"));
            }

            return false;
          },
        },
      },
    }),
  );
}

// ── Exports ──

export { defineBlurSelection, BLUR_CLASS, SELECTION_CLASS };

// ── Editor Context Menu ──
//
// Right-click context menu for the markdown editor.
// Provides quick access to formatting commands, clipboard operations,
// and AI-powered editing skills.
//
// Phase 1: Formatting grid + Clipboard + AI Skills skeleton
//
// Usage in markdown_editor.tsx — wrap the editor mount area:
//
//   <EditorContextMenu>
//     <div class="w-full flex-1" ...>
//       <div ref={editor.mount} />
//     </div>
//   </EditorContextMenu>

import { createSignal, type JSX } from "solid-js";
import { ContextMenu as KMenu } from "@kobalte/core/context-menu";

import {
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuGroupLabel,
  ContextMenuIconButton,
  ContextMenuItem,
  ContextMenuSeparator,
} from "~/components/ui";
import {
  BoldIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  LinkIcon,
  SparklesIcon,
  StrikethroughIcon,
} from "~/components/icons";
import { getActiveEditorInstance } from "~/components/editor/system/editor_engine";
import { executePluginCommand, getAllCommands } from "~/plugins/commands";

// ── Types ──

interface EditorContextMenuProps {
  children: JSX.Element;
}

/** Loosely-typed ProseKit command function (with optional canExec guard). */
type EditorCmd = ((...args: unknown[]) => void) & { canExec?(...args: unknown[]): boolean };

// ── Helpers ──

/**
 * Safely retrieve the commands map from the active ProseKit editor.
 * Returns null when no editor is mounted.
 */
function getEditorCommands(): Record<string, EditorCmd> | null {
  const editor = getActiveEditorInstance();
  if (!editor) return null;
  return (editor as unknown as { commands: Record<string, EditorCmd> }).commands;
}

/** Focus the editor after the context menu finishes closing. */
function queueEditorFocusRestore(): void {
  requestAnimationFrame(() => {
    getActiveEditorInstance()?.view?.focus();
  });
}

/**
 * Check whether a mark is active at the current selection.
 *
 * - Empty selection → checks stored marks / marks at cursor.
 * - Range selection → checks whether the range contains the mark.
 */
function isMarkActive(markName: string): boolean {
  const editor = getActiveEditorInstance();
  if (!editor?.view) return false;

  const state = editor.view.state;
  const markType = state.schema.marks[markName];
  if (!markType) return false;

  const { from, $from, to, empty } = state.selection;
  if (empty) {
    return Boolean(markType.isInSet(state.storedMarks || $from.marks()));
  }
  return state.doc.rangeHasMark(from, to, markType);
}

/**
 * Get the heading level of the block containing the cursor.
 * Returns 0 when the cursor is not inside a heading node.
 */
function getActiveHeadingLevel(): number {
  const editor = getActiveEditorInstance();
  if (!editor?.view) return 0;

  const { $from } = editor.view.state.selection;
  const parent = $from.parent;
  return parent.type.name === "heading" ? (parent.attrs.level as number) : 0;
}

// ── Component ──

export default function EditorContextMenu(props: EditorContextMenuProps) {
  // Snapshot signals — captured once when the menu opens so item states
  // remain stable while the menu is visible.
  const [hasSelection, setHasSelection] = createSignal(false);
  const [activeMarks, setActiveMarks] = createSignal<Set<string>>(new Set());
  const [headingLevel, setHeadingLevel] = createSignal(0);

  // ── State Snapshot ──

  /** Capture the editor's selection and formatting state. */
  function snapshotEditorState(): void {
    const editor = getActiveEditorInstance();
    if (!editor?.view) return;

    const { empty } = editor.view.state.selection;
    setHasSelection(!empty);

    // Active inline marks
    const marks = new Set<string>();
    for (const name of ["bold", "italic", "strike", "code", "link"]) {
      if (isMarkActive(name)) marks.add(name);
    }
    setActiveMarks(marks);

    // Active heading level (0 = not a heading)
    setHeadingLevel(getActiveHeadingLevel());
  }

  function handleOpenChange(open: boolean): void {
    if (open) {
      snapshotEditorState();
    }
  }

  // ── Formatting Actions ──

  /** Toggle an inline mark via its ProseKit command name (e.g. "toggleBold"). */
  function toggleMark(commandName: string): void {
    const cmds = getEditorCommands();
    const cmd = cmds?.[commandName];
    if (!cmd) return;
    cmd();
    queueEditorFocusRestore();
  }

  /** Toggle a heading level (1–6). Calling with the current level removes it. */
  function toggleHeading(level: number): void {
    const cmds = getEditorCommands();
    const cmd = cmds?.toggleHeading;
    if (!cmd) return;
    cmd({ level });
    queueEditorFocusRestore();
  }

  /**
   * Toggle a link mark.
   *
   * - If the selection is already inside a link, remove it.
   * - Otherwise prompt for a destination URL before applying the mark.
   */
  function toggleLink(): void {
    const cmds = getEditorCommands();
    if (!cmds) return;

    if (activeMarks().has("link")) {
      cmds.removeLink?.();
      queueEditorFocusRestore();
      return;
    }

    if (!hasSelection()) return;

    const href = window.prompt("Enter link URL", "https://")?.trim();
    if (!href) {
      queueEditorFocusRestore();
      return;
    }

    cmds.toggleLink?.({ href });
    queueEditorFocusRestore();
  }

  // ── Clipboard Actions ──

  /**
   * Execute a clipboard operation via `document.execCommand`.
   *
   * Deferred to the next animation frame so the menu has time to close
   * and the editor can regain focus (required for `execCommand` to
   * operate on the correct native selection).
   */
  function handleClipboard(action: "cut" | "copy" | "paste"): void {
    requestAnimationFrame(() => {
      const editor = getActiveEditorInstance();
      if (!editor?.view) return;
      editor.view.focus();
      document.execCommand(action);
    });
  }

  // ── AI Skill Actions ──

  /**
   * Handle an AI skill invocation.
   *
   * Phase 1 behaviour: opens the AI chat panel so the user can
   * interact with the assistant manually.
   *
   * Phase 3+ will auto-draft a skill-specific prompt containing the
   * selected text and optionally send it automatically.
   */
  function handleAiSkill(_skill: string): void {
    if (!isAiChatAvailable()) return;
    executePluginCommand("ai-chat.openPanel");
  }

  function isAiChatAvailable(): boolean {
    return getAllCommands().some((reg) => reg.contribution.id === "ai-chat.openPanel");
  }

  // ── Render ──

  return (
    <KMenu onOpenChange={handleOpenChange}>
      {/*
       * `class="contents"` makes the trigger invisible to CSS layout
       * (display: contents) while still capturing the contextmenu event.
       * Menu positioning uses the pointer coordinates from the event,
       * not the trigger's bounding box, so this works correctly.
       */}
      <KMenu.Trigger class="contents">{props.children}</KMenu.Trigger>

      <ContextMenuContent class="w-52">
        {/* ── Inline Mark Toggles ── */}
        <div class="flex items-center gap-0.5 px-1 pt-1 pb-0.5">
          <ContextMenuIconButton
            onSelect={() => toggleMark("toggleBold")}
            active={activeMarks().has("bold")}
            title="Bold (⌘B)"
          >
            <BoldIcon size={15} />
          </ContextMenuIconButton>

          <ContextMenuIconButton
            onSelect={() => toggleMark("toggleItalic")}
            active={activeMarks().has("italic")}
            title="Italic (⌘I)"
          >
            <ItalicIcon size={15} />
          </ContextMenuIconButton>

          <ContextMenuIconButton
            onSelect={() => toggleMark("toggleStrike")}
            active={activeMarks().has("strike")}
            title="Strikethrough"
          >
            <StrikethroughIcon size={15} />
          </ContextMenuIconButton>

          <ContextMenuIconButton
            onSelect={() => toggleMark("toggleCode")}
            active={activeMarks().has("code")}
            title="Inline Code (⌘E)"
          >
            <CodeIcon size={15} />
          </ContextMenuIconButton>

          <ContextMenuIconButton
            onSelect={toggleLink}
            active={activeMarks().has("link")}
            disabled={!hasSelection() && !activeMarks().has("link")}
            title="Link"
          >
            <LinkIcon size={15} />
          </ContextMenuIconButton>
        </div>

        {/* ── Heading Level Toggles ── */}
        <div class="flex items-center gap-0.5 px-1 pb-1">
          <ContextMenuIconButton
            onSelect={() => toggleHeading(1)}
            active={headingLevel() === 1}
            title="Heading 1 (⌘⌥1)"
          >
            <Heading1Icon size={15} />
          </ContextMenuIconButton>

          <ContextMenuIconButton
            onSelect={() => toggleHeading(2)}
            active={headingLevel() === 2}
            title="Heading 2 (⌘⌥2)"
          >
            <Heading2Icon size={15} />
          </ContextMenuIconButton>

          <ContextMenuIconButton
            onSelect={() => toggleHeading(3)}
            active={headingLevel() === 3}
            title="Heading 3 (⌘⌥3)"
          >
            <Heading3Icon size={15} />
          </ContextMenuIconButton>
        </div>

        <ContextMenuSeparator />

        {/* ── Clipboard ── */}
        <ContextMenuItem
          label="Cut"
          shortcut="⌘X"
          onSelect={() => handleClipboard("cut")}
          disabled={!hasSelection()}
        />
        <ContextMenuItem
          label="Copy"
          shortcut="⌘C"
          onSelect={() => handleClipboard("copy")}
          disabled={!hasSelection()}
        />
        <ContextMenuItem label="Paste" shortcut="⌘V" onSelect={() => handleClipboard("paste")} />

        <ContextMenuSeparator />

        {/* ── AI Skills ── */}
        <ContextMenuGroup>
          <ContextMenuGroupLabel>
            <span class="flex items-center gap-1.5">
              <SparklesIcon size={11} />
              AI Skills
            </span>
          </ContextMenuGroupLabel>

          <ContextMenuItem
            label="Improve Writing"
            onSelect={() => handleAiSkill("improve")}
            disabled={!hasSelection() || !isAiChatAvailable()}
          />
          <ContextMenuItem
            label="Proofread"
            onSelect={() => handleAiSkill("proofread")}
            disabled={!hasSelection() || !isAiChatAvailable()}
          />
          <ContextMenuItem
            label="Explain"
            onSelect={() => handleAiSkill("explain")}
            disabled={!hasSelection() || !isAiChatAvailable()}
          />
          <ContextMenuItem
            label="Summarize"
            onSelect={() => handleAiSkill("summarize")}
            disabled={!hasSelection() || !isAiChatAvailable()}
          />
          <ContextMenuItem
            label="Translate"
            onSelect={() => handleAiSkill("translate")}
            disabled={!hasSelection() || !isAiChatAvailable()}
          />
        </ContextMenuGroup>

        <ContextMenuSeparator />

        {/* ── Edit with AI (free-form) ── */}
        <ContextMenuItem
          label="Edit with AI"
          shortcut="⌘⌃E"
          onSelect={() => handleAiSkill("edit")}
          disabled={!isAiChatAvailable()}
        />
      </ContextMenuContent>
    </KMenu>
  );
}

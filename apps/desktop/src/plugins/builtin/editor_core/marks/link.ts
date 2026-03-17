// ── Link Mark ──
//
// Defines the "link" mark for hyperlinks with href, target, rel attributes.
// Provides schema spec, add/remove/toggle/expand commands.
//
// Vendored from ProseKit predefined extension with customizations.
// Auto-linking rules are included from the upstream extension.

import {
  addMark,
  defineClickHandler,
  defineCommands,
  defineMarkSpec,
  expandMark,
  removeMark,
  toggleMark,
  union,
  type Extension,
} from "prosekit/core";
import { defineInputRule } from "prosekit/extensions/input-rule";
import { InputRule } from "prosekit/pm/inputrules";
import {
  defineLinkEnterRule,
  defineLinkInputRule,
  defineLinkPasteRule,
} from "prosekit/extensions/link";

import { parseMarkdownLinkLikeSyntax } from "../markdown_input";

function defineLinkSpec(): Extension {
  return defineMarkSpec({
    name: "link",
    inclusive: false,
    attrs: {
      href: { default: "" },
      title: { default: null },
      target: { default: null },
      rel: { default: null },
    },
    parseDOM: [
      {
        tag: "a[href]",
        getAttrs: (dom) => ({
          href: dom.getAttribute("href") || "",
          title: dom.getAttribute("title") || null,
          target: dom.getAttribute("target") || null,
          rel: dom.getAttribute("rel") || null,
        }),
      },
    ],
    toDOM(node) {
      const { href, title, target, rel } = node.attrs as {
        href: string;
        title: string | null;
        target: string | null;
        rel: string | null;
      };
      return ["a", { href, title: title ?? undefined, target, rel }, 0];
    },
  });
}

function defineLinkCommands(): Extension {
  return defineCommands({
    addLink: (attrs?: { href: string; title?: string; target?: string; rel?: string }) =>
      addMark({ type: "link", attrs }),
    removeLink: () => removeMark({ type: "link" }),
    toggleLink: (attrs?: { href: string; title?: string; target?: string; rel?: string }) =>
      toggleMark({ type: "link", attrs }),
    expandLink: () => expandMark({ type: "link" }),
  });
}

function defineMarkdownLinkInputRule(): Extension {
  return defineInputRule(
    new InputRule(/\[[\s\S]*\)$/, (state, match, start, end) => {
      const parsed = parseMarkdownLinkLikeSyntax(match[0] ?? "", {
        image: false,
        allowEmptyLabel: true,
      });
      if (!parsed) return null;

      // If this is actually part of an image syntax, let the image rule handle it.
      const before = start > 0 ? state.doc.textBetween(start - 1, start, undefined, "\0") : "";
      if (before === "!") return null;

      const { schema, tr } = state;
      const mark = schema.marks.link.create({ href: parsed.target });
      const textNode = schema.text(parsed.label || parsed.target, [mark]);
      tr.replaceRangeWith(start, end, textNode);
      return tr.scrollIntoView();
    }),
  );
}

function defineLinkClickHandler(): Extension {
  return defineClickHandler((_view, _pos, event) => {
    const target = event.target;
    if (!(target instanceof Element)) return false;

    const anchor = target.closest("a[href]");
    if (!anchor) return false;

    const href = anchor.getAttribute("href");
    if (!href) return false;

    event.preventDefault();
    void openExternalLink(href);
    return true;
  });
}

async function openExternalLink(href: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(href);
  } catch {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}

function defineLink(): Extension {
  return union(
    defineLinkSpec(),
    defineLinkCommands(),
    defineMarkdownLinkInputRule(),
    defineLinkInputRule(),
    defineLinkEnterRule(),
    defineLinkPasteRule(),
    defineLinkClickHandler(),
  );
}

export { defineLink };

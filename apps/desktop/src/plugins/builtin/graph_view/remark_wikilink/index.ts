import type { Extension as FromMarkdownExtension } from "mdast-util-from-markdown";
import type { Extension as MicromarkExtension } from "micromark-util-types";

import { fromMarkdown } from "./from_markdown";
import { syntax } from "./syntax";
import "./types";

interface RemarkData {
  micromarkExtensions?: MicromarkExtension[];
  fromMarkdownExtensions?: FromMarkdownExtension[];
}

function applyRemarkWikilink(this: { data(): unknown }): void {
  const data = this.data() as RemarkData & Record<string, unknown>;

  data.micromarkExtensions ??= [];
  data.fromMarkdownExtensions ??= [];

  data.micromarkExtensions.push(syntax());
  data.fromMarkdownExtensions.push(fromMarkdown());
}

const remarkWikilink = applyRemarkWikilink;

export { remarkWikilink };

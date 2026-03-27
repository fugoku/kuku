import type {
  Code,
  Heading,
  Image,
  Link,
  List,
  ListItem,
  PhrasingContent,
  RootContent,
  Table,
  TableCell,
  TableRow,
} from "mdast";

import { createMemo, type JSX } from "solid-js";

import { createProcessor } from "~/lib/markdown";

const processor = createProcessor();
type RenderableContent = RootContent | PhrasingContent;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderChildren(children: readonly RenderableContent[]): string {
  return children.map((child) => renderNode(child)).join("");
}

function renderList(node: List): string {
  const tag = node.ordered ? "ol" : "ul";
  const start = node.ordered && node.start && node.start > 1 ? ` start="${node.start}"` : "";
  return `<${tag}${start}>${node.children.map((child) => renderListItem(child)).join("")}</${tag}>`;
}

function renderListItem(node: ListItem): string {
  const content = renderChildren(node.children as readonly RenderableContent[]);
  return `<li>${content || "<p></p>"}</li>`;
}

function renderHeading(node: Heading): string {
  const depth = Math.min(Math.max(node.depth, 1), 6);
  return `<h${depth}>${renderChildren(node.children)}</h${depth}>`;
}

function renderCode(node: Code): string {
  const language = node.lang ? ` data-language="${escapeHtml(node.lang)}"` : "";
  return `<pre><code${language}>${escapeHtml(node.value)}</code></pre>`;
}

function renderLink(node: Link): string {
  const href = escapeHtml(node.url);
  return `<a href="${href}" target="_blank" rel="noreferrer noopener">${renderChildren(node.children)}</a>`;
}

function renderImage(node: Image): string {
  const label = escapeHtml(node.alt || node.url);
  const href = escapeHtml(node.url);
  return `<a href="${href}" target="_blank" rel="noreferrer noopener">${label}</a>`;
}

function renderTable(node: Table): string {
  const [head, ...body] = node.children;
  const headHtml = head ? `<thead>${renderTableRow(head, true)}</thead>` : "";
  const bodyHtml =
    body.length > 0
      ? `<tbody>${body.map((row) => renderTableRow(row, false)).join("")}</tbody>`
      : "";
  return `<div class="overflow-x-auto"><table>${headHtml}${bodyHtml}</table></div>`;
}

function renderTableRow(node: TableRow, isHead: boolean): string {
  return `<tr>${node.children.map((cell) => renderTableCell(cell, isHead)).join("")}</tr>`;
}

function renderTableCell(node: TableCell, isHead: boolean): string {
  const tag = isHead ? "th" : "td";
  return `<${tag}>${renderChildren(node.children)}</${tag}>`;
}

function renderNode(node: RenderableContent): string {
  switch (node.type) {
    case "paragraph":
      return `<p>${renderChildren(node.children)}</p>`;
    case "text":
      return escapeHtml(node.value);
    case "strong":
      return `<strong>${renderChildren(node.children)}</strong>`;
    case "emphasis":
      return `<em>${renderChildren(node.children)}</em>`;
    case "delete":
      return `<del>${renderChildren(node.children)}</del>`;
    case "inlineCode":
      return `<code>${escapeHtml(node.value)}</code>`;
    case "code":
      return renderCode(node);
    case "blockquote":
      return `<blockquote>${renderChildren(node.children as readonly RenderableContent[])}</blockquote>`;
    case "heading":
      return renderHeading(node);
    case "list":
      return renderList(node);
    case "listItem":
      return renderListItem(node);
    case "thematicBreak":
      return "<hr />";
    case "break":
      return "<br />";
    case "link":
      return renderLink(node);
    case "image":
      return renderImage(node);
    case "table":
      return renderTable(node);
    case "tableRow":
      return renderTableRow(node, false);
    case "tableCell":
      return renderTableCell(node, false);
    case "html":
      return `<code>${escapeHtml(node.value)}</code>`;
    default:
      if ("children" in node && Array.isArray(node.children)) {
        return renderChildren(node.children as readonly RenderableContent[]);
      }
      if ("target" in node && typeof node.target === "string") {
        return escapeHtml(node.target);
      }
      if ("value" in node && typeof node.value === "string") {
        return escapeHtml(node.value);
      }
      return "";
  }
}

function renderMarkdown(source: string): string {
  try {
    const tree = processor.parse(source) as { children: RootContent[] };
    return renderChildren(tree.children);
  } catch {
    return `<p>${escapeHtml(source)}</p>`;
  }
}

function MarkdownMessage(props: { content: string }): JSX.Element {
  const html = createMemo(() => renderMarkdown(props.content));

  return (
    <div
      class="space-y-3 text-inherit [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-text-muted [&_code]:rounded-xs [&_code]:bg-bg-primary/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_del]:opacity-80 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_hr]:border-border [&_li]:ml-5 [&_ol]:list-decimal [&_p]:whitespace-pre-wrap [&_pre]:overflow-auto [&_pre]:rounded-xs [&_pre]:bg-bg-primary/70 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:w-full [&_table]:border-collapse [&_tbody_tr:not(:last-child)]:border-b [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-border [&_th]:bg-bg-primary/60 [&_th]:px-2 [&_th]:py-1.5 [&_ul]:list-disc"
      innerHTML={html()}
    />
  );
}

export { MarkdownMessage };

// ── Markdown Service ──
//
// Collects markdown contributions from plugins, builds a unified
// markdown ↔ PM JSON conversion service, and exposes parse/stringify API.
//
// Lifecycle:
//   1. Collection: contributeMarkdown() called during plugin activation
//   2. Build: buildMarkdownService() called after all plugins activated
//   3. Use: getMarkdownService() returns the frozen service
//
// Design: v1.3 §7 Markdown Round-Trip Pipeline

import {
  type PMNodeJSON,
  type RemarkPlugin,
  RegistryBuilder,
  createProcessor,
  mdastToProseMirror,
  proseMirrorToMdast,
} from "~/lib/markdown";
import type { MarkdownContribution } from "./types";

// ── Types ──

export interface MarkdownService {
  parse(source: string): PMNodeJSON;
  stringify(doc: PMNodeJSON): string;
}

type Disposer = () => void;

// ── State ──

const pendingContributions = new Map<string, MarkdownContribution>();
let service: MarkdownService | null = null;

// ── Collection Phase (called during plugin activation) ──

export function contributeMarkdown(pluginId: string, contribution: MarkdownContribution): Disposer {
  pendingContributions.set(pluginId, contribution);
  return () => {
    pendingContributions.delete(pluginId);
  };
}

// ── Build Phase (called once after all plugins activated) ──

export function buildMarkdownService(): void {
  const builder = new RegistryBuilder().addBase();
  const remarkPlugins: RemarkPlugin[] = [];

  for (const [, contrib] of pendingContributions) {
    // Collect remark plugins
    if (contrib.remarkPlugins) {
      remarkPlugins.push(...contrib.remarkPlugins);
    }
    // Collect mdast → PM handlers
    if (contrib.mdastToPm?.block) {
      for (const [type, handler] of Object.entries(contrib.mdastToPm.block)) {
        builder.addMdastBlockHandler(type, handler);
      }
    }
    if (contrib.mdastToPm?.inline) {
      for (const [type, handler] of Object.entries(contrib.mdastToPm.inline)) {
        builder.addMdastInlineHandler(type, handler);
      }
    }
    // Collect PM → mdast handlers
    if (contrib.pmToMdast?.block) {
      for (const [type, handler] of Object.entries(contrib.pmToMdast.block)) {
        builder.addPmBlockHandler(type, handler);
      }
    }
    if (contrib.pmToMdast?.inline) {
      for (const [type, handler] of Object.entries(contrib.pmToMdast.inline)) {
        builder.addPmInlineHandler(type, handler);
      }
    }
    if (contrib.pmToMdast?.mark) {
      for (const [type, handler] of Object.entries(contrib.pmToMdast.mark)) {
        builder.addPmMarkHandler(type, handler);
      }
    }
  }

  // Build — R1: build() internally calls createTextInlineHandler if mark count > 0
  const registry = builder.build();
  const processor = createProcessor({ remarkPlugins });

  // Freeze service (idempotent — re-calling replaces previous service)
  service = {
    parse: (source) => mdastToProseMirror(processor.parse(source), registry),
    stringify: (doc) => processor.stringify(proseMirrorToMdast(doc, registry)),
  };
}

// ── Access ──

export function getMarkdownService(): MarkdownService | null {
  return service;
}

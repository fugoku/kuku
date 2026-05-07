import { lazy } from "solid-js";
import { definePlugin } from "prosekit/core";

import type { AiProxyToolRegistry } from "~/plugins/builtin/core_tool_registry/types";
import type { KukuPlugin } from "~/plugins/types";
import { openRightPanelView } from "~/stores/layout";

import { registerKnowledgeAiTools } from "./ai_tools";
import { knowledgeMarkdown } from "./markdown_handlers";
import { createKnowledgeService } from "./service";
import { knowledgeSettings } from "./settings";

const KnowledgePanel = lazy(() => import("./components/knowledge_panel"));

const knowledgePlugin: KukuPlugin = {
  id: "knowledge",
  name: "Second Brain",
  version: "0.1.0",
  description: "Knowledge memory proposal, review, apply, and search",
  dependencies: ["core-tool-registry", "core-editor", "core-indexer"],

  views: [
    {
      id: "knowledge.panel",
      label: "Second Brain",
      icon: "knowledge",
      location: { slot: "rightPanel" },
      order: 30,
      component: KnowledgePanel,
    },
  ],

  editor: {
    extension: () => definePlugin(() => []),
    markdown: knowledgeMarkdown,
  },

  commands: [
    {
      id: "knowledge.openPanel",
      label: "Open Second Brain",
      category: "Second Brain",
      execute: () => openRightPanelView("knowledge.panel"),
    },
    {
      id: "knowledge.init",
      label: "Initialize Second Brain",
      category: "Second Brain",
      execute: () => {
        const service = createKnowledgeService();
        void service.init();
      },
    },
  ],

  settings: knowledgeSettings,

  activate(ctx) {
    const service = createKnowledgeService();
    ctx.services.register("knowledge", service);
    const proxyTools = ctx.services.get("core-tool-registry.proxyTools") as
      | AiProxyToolRegistry
      | undefined;
    if (proxyTools) {
      ctx.track(registerKnowledgeAiTools(proxyTools, service));
    }
  },
};

export { knowledgePlugin };
export type { KnowledgeService } from "./service";
export type {
  ApplyDecisionDocumentResult,
  ApplyDecisionDocumentStatus,
  KnowledgeInitResult,
  KnowledgeStatusResult,
} from "./types";

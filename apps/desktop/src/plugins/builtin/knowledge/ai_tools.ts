import type { AiProxyToolRegistry } from "~/plugins/builtin/core_tool_registry/types";
import type { Disposer } from "~/plugins/types";

import type { CreateDecisionDocumentRequest, KnowledgeError } from "./types";
import type { KnowledgeService } from "./service";

const KNOWLEDGE_AI_TOOL_NAMES = ["memory_propose"] as const;
const FORBIDDEN_KNOWLEDGE_AI_TOOL_NAMES = [
  "memory_commit",
  "memory_write",
  "memory_delete",
  "knowledge_apply_decision_document",
] as const;

function registerKnowledgeAiTools(
  registry: AiProxyToolRegistry,
  service: KnowledgeService,
): Disposer {
  return registry.register({
    name: "memory_propose",
    toolId: "knowledge.memory_propose",
    description:
      "Create a Knowledge decision document that proposes memories for explicit user review. This never commits memory.",
    category: "knowledge",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        context: { type: "string" },
        source_refs: { type: "array" },
        proposed_memories: {
          type: "array",
          description: "Memory proposals to place in a user-reviewed decision document.",
        },
        default_selection: {
          type: "string",
          enum: ["yes", "none"],
          description: "Defaults to yes. Use none when the user should make every selection.",
        },
      },
      required: ["proposed_memories"],
    },
    handler: async (args) => {
      const result = await service.proposeMemory(memoryProposeRequestFromArgs(args));
      if (!result.ok) {
        throw new Error(formatKnowledgeError(result.error));
      }
      return JSON.stringify(result.value, null, 2);
    },
  });
}

function memoryProposeRequestFromArgs(
  args: Record<string, unknown>,
): CreateDecisionDocumentRequest {
  if (!Array.isArray(args.proposed_memories)) {
    throw new Error("proposed_memories is required");
  }

  return {
    title: optionalString(args.title),
    context: optionalString(args.context),
    source_refs: optionalArray(args.source_refs) as CreateDecisionDocumentRequest["source_refs"],
    proposed_memories: args.proposed_memories as CreateDecisionDocumentRequest["proposed_memories"],
    default_selection: parseDefaultSelection(args.default_selection),
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function optionalArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function parseDefaultSelection(value: unknown): CreateDecisionDocumentRequest["default_selection"] {
  if (value === "yes" || value === "none") {
    return value;
  }
  return undefined;
}

function formatKnowledgeError(error: KnowledgeError): string {
  return JSON.stringify({ code: error.code, message: error.message, details: error.details });
}

export {
  FORBIDDEN_KNOWLEDGE_AI_TOOL_NAMES,
  KNOWLEDGE_AI_TOOL_NAMES,
  memoryProposeRequestFromArgs,
  registerKnowledgeAiTools,
};

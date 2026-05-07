import { invoke } from "@tauri-apps/api/core";

import type {
  CreateDecisionDocumentRequest,
  CreateDecisionDocumentResult,
  KnowledgeCommandResult,
  KnowledgeError,
  KnowledgeInitResult,
  KnowledgeStatusResult,
} from "./types";

interface KnowledgeService {
  status(): Promise<KnowledgeCommandResult<KnowledgeStatusResult>>;
  init(): Promise<KnowledgeCommandResult<KnowledgeInitResult>>;
  createDecisionDocument(
    request: CreateDecisionDocumentRequest,
  ): Promise<KnowledgeCommandResult<CreateDecisionDocumentResult>>;
  proposeMemory(
    request: CreateDecisionDocumentRequest,
  ): Promise<KnowledgeCommandResult<CreateDecisionDocumentResult>>;
}

function transportError(error: unknown): KnowledgeError {
  return {
    code: "IO_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}

async function invokeKnowledge<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<KnowledgeCommandResult<T>> {
  try {
    return await invoke<KnowledgeCommandResult<T>>(command, args);
  } catch (error) {
    return { ok: false, error: transportError(error) };
  }
}

function createKnowledgeService(): KnowledgeService {
  return {
    status() {
      return invokeKnowledge<KnowledgeStatusResult>("knowledge_status");
    },
    init() {
      return invokeKnowledge<KnowledgeInitResult>("knowledge_init");
    },
    createDecisionDocument(request) {
      return invokeKnowledge<CreateDecisionDocumentResult>("knowledge_create_decision_document", {
        request,
      });
    },
    proposeMemory(request) {
      return invokeKnowledge<CreateDecisionDocumentResult>("memory_propose", { request });
    },
  };
}

export { createKnowledgeService };
export type { KnowledgeService };

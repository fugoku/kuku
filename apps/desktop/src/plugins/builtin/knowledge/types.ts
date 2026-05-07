type KnowledgeErrorCode =
  | "INVALID_ARGUMENT"
  | "VALIDATION_FAILED"
  | "UNSAFE_PATH"
  | "ALREADY_EXISTS"
  | "NOT_PENDING"
  | "APPLY_IN_PROGRESS"
  | "APPLY_RECOVERY_REQUIRED"
  | "APPLY_FAILED"
  | "DOCUMENT_CHANGED"
  | "IO_ERROR";

interface KnowledgeError {
  code: KnowledgeErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

type KnowledgeCommandResult<T> = { ok: true; value: T } | { ok: false; error: KnowledgeError };

type ProposalDefaultSelection = "yes" | "none";

type DecisionOptionId = "yes" | "no" | "other";

interface SourceRange {
  start_line: number;
  end_line: number;
}

interface SourceRefInput {
  path: string;
  title?: string;
  section_path?: string[];
  range?: SourceRange;
  checksum?: string;
  captured_at?: string;
}

interface ProposedMemoryInput {
  suggested_id?: string;
  kind?: string;
  title: string;
  body: string;
  tags?: string[];
  source_refs?: SourceRefInput[];
  decision?: {
    question?: string;
    selected_option_id?: DecisionOptionId;
    other_text?: string;
  };
}

interface CreateDecisionDocumentRequest {
  title?: string;
  context?: string;
  source_refs?: SourceRefInput[];
  proposed_memories: ProposedMemoryInput[];
  default_selection?: ProposalDefaultSelection;
}

interface KnowledgeStatusResult {
  initialized: boolean;
  root_exists: boolean;
  memory_dir_exists: boolean;
  proposals_dir_exists: boolean;
  decisions_dir_exists: boolean;
  cache_dir_exists: boolean;
}

type KnowledgeInitResult = KnowledgeStatusResult & {
  created_dirs: string[];
};

interface CreateDecisionDocumentResult {
  doc_id: string;
  proposal_id: string;
  path: string;
  title: string;
  created: boolean;
  should_open: true;
}

export type {
  CreateDecisionDocumentRequest,
  CreateDecisionDocumentResult,
  DecisionOptionId,
  KnowledgeCommandResult,
  KnowledgeError,
  KnowledgeErrorCode,
  KnowledgeInitResult,
  KnowledgeStatusResult,
  ProposalDefaultSelection,
  ProposedMemoryInput,
  SourceRange,
  SourceRefInput,
};

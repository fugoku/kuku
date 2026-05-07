use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use serde_yaml::{Mapping, Value};
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

use crate::knowledge::decision_document::{
    DecisionBlock, DecisionDocumentError, MemoryProposalBlock, ParsedDecisionDocument,
    ParsedKukuBlock, parse_decision_document, render_decision_document,
    validate_decision_document_integrity,
};
use crate::knowledge::markdown::{
    format_utc_timestamp, serialize_memory_item, sha256_checksum_bytes,
    validate_safe_vault_relative_path, validate_sha256_checksum,
};
use crate::knowledge::models::{
    ApplyDecisionDocumentRequest, ApplyDecisionDocumentResult, ApplyDecisionDocumentStatus,
    DecisionOptionId, KnowledgeErrorCode, MemoryItem, MemoryStatus,
};

#[derive(Debug, Clone)]
pub struct ApplyServiceError {
    pub code: KnowledgeErrorCode,
    pub message: String,
}

impl ApplyServiceError {
    fn validation(message: impl Into<String>) -> Self {
        Self {
            code: KnowledgeErrorCode::ValidationFailed,
            message: message.into(),
        }
    }

    fn document_changed(message: impl Into<String>) -> Self {
        Self {
            code: KnowledgeErrorCode::DocumentChanged,
            message: message.into(),
        }
    }

    fn apply_in_progress(message: impl Into<String>) -> Self {
        Self {
            code: KnowledgeErrorCode::ApplyInProgress,
            message: message.into(),
        }
    }

    fn already_exists(message: impl Into<String>) -> Self {
        Self {
            code: KnowledgeErrorCode::AlreadyExists,
            message: message.into(),
        }
    }

    fn not_pending(message: impl Into<String>) -> Self {
        Self {
            code: KnowledgeErrorCode::NotPending,
            message: message.into(),
        }
    }

    fn io(message: impl Into<String>) -> Self {
        Self {
            code: KnowledgeErrorCode::IoError,
            message: message.into(),
        }
    }
}

impl From<DecisionDocumentError> for ApplyServiceError {
    fn from(value: DecisionDocumentError) -> Self {
        Self {
            code: value.code,
            message: value.message,
        }
    }
}

pub async fn apply_decision_document_for_root(
    root: &Path,
    request: ApplyDecisionDocumentRequest,
) -> Result<ApplyDecisionDocumentResult, ApplyServiceError> {
    validate_apply_request(&request)?;
    let relative_path = validate_decision_document_path(&request.path)?;
    let path = root.join(&relative_path);
    let initial_markdown = tokio::fs::read_to_string(&path)
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    let initial_document = parse_decision_document(&initial_markdown)?;
    let doc_id = initial_document.frontmatter.id.clone();

    let apply_lock = ApplyLock::acquire(root, &doc_id).await?;
    let document_lock = DocumentWriteLock::acquire(root, &relative_path).await?;

    let result = apply_decision_document_with_locks(root, &path, &relative_path, request).await;

    drop(document_lock);
    drop(apply_lock);

    result
}

async fn apply_decision_document_with_locks(
    root: &Path,
    path: &Path,
    relative_path: &str,
    request: ApplyDecisionDocumentRequest,
) -> Result<ApplyDecisionDocumentResult, ApplyServiceError> {
    let current_markdown = tokio::fs::read_to_string(path)
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    let current_checksum = sha256_checksum_bytes(current_markdown.as_bytes());
    if current_checksum != request.expected_checksum {
        return Err(ApplyServiceError::document_changed(
            "Decision document changed before apply",
        ));
    }

    let mut document = parse_decision_document(&current_markdown)?;
    if document.frontmatter.status != "pending" {
        return Err(ApplyServiceError::not_pending(
            "Decision document is not pending",
        ));
    }
    validate_decision_document_integrity(&document, Some(root))?;

    let outcomes = collect_decision_outcomes(&document)?;
    let document_status = document_status_for_outcomes(&outcomes);
    let resolved_at = format_utc_timestamp(SystemTime::now());
    if outcomes
        .iter()
        .any(|outcome| outcome.selected == DecisionOptionId::Yes)
    {
        return apply_with_memory_writes(MemoryWriteApplyInput {
            root,
            decision_document_path: path,
            relative_decision_document_path: relative_path,
            decision_document_checksum_before: current_checksum,
            document,
            outcomes,
            document_status,
            resolved_at,
        })
        .await;
    }

    apply_decision_updates(
        &mut document,
        &outcomes,
        document_status.as_str(),
        &resolved_at,
    );
    let next_markdown = render_decision_document(&document)?;

    guarded_replace_file(path, current_checksum, next_markdown.as_bytes()).await?;

    Ok(ApplyDecisionDocumentResult {
        doc_id: document.frontmatter.id,
        path: relative_path.to_string(),
        status: document_status,
        committed_memory_paths: vec![],
        rejected_decision_ids: outcomes
            .iter()
            .filter(|outcome| outcome.selected == DecisionOptionId::No)
            .map(|outcome| outcome.decision_id.clone())
            .collect(),
        needs_revision_decision_ids: outcomes
            .iter()
            .filter(|outcome| outcome.selected == DecisionOptionId::Other)
            .map(|outcome| outcome.decision_id.clone())
            .collect(),
        recovered_from_journal: false,
        warnings: vec![],
        journal_cleanup_required: None,
        journal_path: None,
    })
}

fn validate_apply_request(request: &ApplyDecisionDocumentRequest) -> Result<(), ApplyServiceError> {
    if request.source != "editor_document_apply" {
        return Err(ApplyServiceError::validation(
            "Unsupported decision document apply source",
        ));
    }
    validate_sha256_checksum(&request.expected_checksum, "expected_checksum")
        .map_err(|error| ApplyServiceError::validation(error.message))?;
    Ok(())
}

fn validate_decision_document_path(path: &str) -> Result<String, ApplyServiceError> {
    let path = validate_safe_vault_relative_path(path, "path")
        .map_err(|error| ApplyServiceError::validation(error.message))?;
    if !path.starts_with("Knowledge/decisions/") {
        return Err(ApplyServiceError::validation(
            "Decision document path must be under Knowledge/decisions/",
        ));
    }
    Ok(path)
}

#[derive(Debug, Clone)]
struct ZeroWriteOutcome {
    decision_id: String,
    target_change_id: String,
    selected: DecisionOptionId,
    memory_path: Option<String>,
}

fn collect_decision_outcomes(
    document: &ParsedDecisionDocument,
) -> Result<Vec<ZeroWriteOutcome>, ApplyServiceError> {
    let proposal_by_id = document
        .proposal_blocks()
        .map(|proposal| (proposal.value.id.as_str(), &proposal.value))
        .collect::<BTreeMap<_, _>>();
    let mut outcomes = Vec::new();
    for decision in document.decision_blocks() {
        let selected = selected_decision_option(&decision.value)?;
        if selected == DecisionOptionId::Other {
            let other_text = decision.value.other_text.as_deref().unwrap_or_default();
            if other_text.trim().is_empty() {
                return Err(ApplyServiceError::validation(
                    "Other decisions require non-empty other_text",
                ));
            }
        }
        let memory_path = if selected == DecisionOptionId::Yes {
            let proposal = proposal_by_id
                .get(decision.value.target_change_id.as_str())
                .ok_or_else(|| {
                    ApplyServiceError::validation("Decision target has no memory proposal")
                })?;
            Some(memory_path_for_id(&proposal.memory.id))
        } else {
            None
        };
        outcomes.push(ZeroWriteOutcome {
            decision_id: decision.value.id.clone(),
            target_change_id: decision.value.target_change_id.clone(),
            selected,
            memory_path,
        });
    }
    Ok(outcomes)
}

fn selected_decision_option(block: &DecisionBlock) -> Result<DecisionOptionId, ApplyServiceError> {
    match block.selected_option_id.as_deref() {
        Some("yes") => Ok(DecisionOptionId::Yes),
        Some("no") => Ok(DecisionOptionId::No),
        Some("other") => Ok(DecisionOptionId::Other),
        Some(value) => Err(ApplyServiceError::validation(format!(
            "Unsupported selected option id: {value}"
        ))),
        None => Err(ApplyServiceError::validation(
            "Required decision is missing selected_option_id",
        )),
    }
}

fn memory_path_for_id(memory_id: &str) -> String {
    format!("Knowledge/memory/{memory_id}.md")
}

fn document_status_for_outcomes(outcomes: &[ZeroWriteOutcome]) -> ApplyDecisionDocumentStatus {
    let has_committed = outcomes
        .iter()
        .any(|outcome| outcome.selected == DecisionOptionId::Yes);
    let has_needs_revision = outcomes
        .iter()
        .any(|outcome| outcome.selected == DecisionOptionId::Other);
    if has_committed && has_needs_revision {
        ApplyDecisionDocumentStatus::PartiallyApplied
    } else if has_needs_revision {
        ApplyDecisionDocumentStatus::NeedsRevision
    } else {
        ApplyDecisionDocumentStatus::Applied
    }
}

fn apply_decision_updates(
    document: &mut ParsedDecisionDocument,
    outcomes: &[ZeroWriteOutcome],
    document_status: &str,
    resolved_at: &str,
) {
    let committed = outcomes
        .iter()
        .filter(|outcome| outcome.selected == DecisionOptionId::Yes)
        .map(|outcome| outcome.decision_id.as_str())
        .collect::<BTreeSet<_>>();
    let rejected = outcomes
        .iter()
        .filter(|outcome| outcome.selected == DecisionOptionId::No)
        .map(|outcome| outcome.decision_id.as_str())
        .collect::<BTreeSet<_>>();
    let needs_revision = outcomes
        .iter()
        .filter(|outcome| outcome.selected == DecisionOptionId::Other)
        .map(|outcome| outcome.decision_id.as_str())
        .collect::<BTreeSet<_>>();

    document.frontmatter.status = document_status.to_string();
    document.frontmatter.updated_at = resolved_at.to_string();
    set_frontmatter_string(&mut document.frontmatter.raw, "status", document_status);
    set_frontmatter_string(&mut document.frontmatter.raw, "updated_at", resolved_at);

    for block in &mut document.blocks {
        let ParsedKukuBlock::Decision(decision) = block else {
            continue;
        };
        if committed.contains(decision.value.id.as_str()) {
            decision.value.status = "committed".to_string();
            decision.value.resolved_at = Some(resolved_at.to_string());
        } else if rejected.contains(decision.value.id.as_str()) {
            decision.value.status = "rejected".to_string();
            decision.value.resolved_at = Some(resolved_at.to_string());
        } else if needs_revision.contains(decision.value.id.as_str()) {
            decision.value.status = "needs_revision".to_string();
            decision.value.resolved_at = Some(resolved_at.to_string());
        }
    }
}

fn set_frontmatter_string(frontmatter: &mut Mapping, key: &str, value: &str) {
    frontmatter.insert(
        Value::String(key.to_string()),
        Value::String(value.to_string()),
    );
}

struct MemoryWriteApplyInput<'a> {
    root: &'a Path,
    decision_document_path: &'a Path,
    relative_decision_document_path: &'a str,
    decision_document_checksum_before: String,
    document: ParsedDecisionDocument,
    outcomes: Vec<ZeroWriteOutcome>,
    document_status: ApplyDecisionDocumentStatus,
    resolved_at: String,
}

async fn apply_with_memory_writes(
    input: MemoryWriteApplyInput<'_>,
) -> Result<ApplyDecisionDocumentResult, ApplyServiceError> {
    let MemoryWriteApplyInput {
        root,
        decision_document_path,
        relative_decision_document_path,
        decision_document_checksum_before,
        mut document,
        outcomes,
        document_status,
        resolved_at,
    } = input;

    let planned_writes = plan_memory_writes(
        root,
        &document,
        &outcomes,
        relative_decision_document_path,
        &resolved_at,
    )?;
    preflight_memory_paths(root, &planned_writes).await?;

    let journal_path = journal_path(root, &document.frontmatter.id);
    let mut journal = ApplyJournal::new(
        &document.frontmatter.id,
        &document.frontmatter.proposal_id,
        relative_decision_document_path,
        &decision_document_checksum_before,
        &planned_writes,
        &outcomes,
        &resolved_at,
    );
    write_journal_atomic(&journal_path, &journal).await?;

    for planned in &planned_writes {
        stage_memory_file(planned).await?;
    }

    for planned in &planned_writes {
        journal.inflight_publish_path = Some(planned.final_path.clone());
        journal.updated_at = format_utc_timestamp(SystemTime::now());
        write_journal_atomic(&journal_path, &journal).await?;

        publish_memory_file(root, planned).await?;

        journal.created_paths.push(planned.final_path.clone());
        journal
            .memory_checksums
            .insert(planned.final_path.clone(), planned.checksum.clone());
        journal.inflight_publish_path = None;
        journal.updated_at = format_utc_timestamp(SystemTime::now());
        write_journal_atomic(&journal_path, &journal).await?;
    }

    journal.state = ApplyJournalState::Finalized;
    journal.finalized_memory_paths = journal.created_paths.clone();
    journal.updated_at = format_utc_timestamp(SystemTime::now());
    write_journal_atomic(&journal_path, &journal).await?;

    apply_decision_updates(
        &mut document,
        &outcomes,
        document_status.as_str(),
        &resolved_at,
    );
    let next_markdown = render_decision_document(&document)?;
    guarded_replace_file(
        decision_document_path,
        decision_document_checksum_before,
        next_markdown.as_bytes(),
    )
    .await?;

    journal.state = ApplyJournalState::DocumentSaved;
    journal.updated_at = format_utc_timestamp(SystemTime::now());
    write_journal_atomic(&journal_path, &journal).await?;
    tokio::fs::remove_file(&journal_path)
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    cleanup_staging_dir(root, &document.frontmatter.id).await?;

    Ok(ApplyDecisionDocumentResult {
        doc_id: document.frontmatter.id,
        path: relative_decision_document_path.to_string(),
        status: document_status,
        committed_memory_paths: planned_writes
            .iter()
            .map(|planned| planned.final_path.clone())
            .collect(),
        rejected_decision_ids: outcomes
            .iter()
            .filter(|outcome| outcome.selected == DecisionOptionId::No)
            .map(|outcome| outcome.decision_id.clone())
            .collect(),
        needs_revision_decision_ids: outcomes
            .iter()
            .filter(|outcome| outcome.selected == DecisionOptionId::Other)
            .map(|outcome| outcome.decision_id.clone())
            .collect(),
        recovered_from_journal: false,
        warnings: vec![],
        journal_cleanup_required: None,
        journal_path: None,
    })
}

#[derive(Debug, Clone)]
struct PlannedMemoryWrite {
    memory_id: String,
    final_path: String,
    staged_path: PathBuf,
    bytes: Vec<u8>,
    checksum: String,
}

fn plan_memory_writes(
    root: &Path,
    document: &ParsedDecisionDocument,
    outcomes: &[ZeroWriteOutcome],
    decision_document_path: &str,
    timestamp: &str,
) -> Result<Vec<PlannedMemoryWrite>, ApplyServiceError> {
    let proposals = document
        .proposal_blocks()
        .map(|proposal| (proposal.value.id.as_str(), &proposal.value))
        .collect::<BTreeMap<_, _>>();
    let mut planned = Vec::new();
    for outcome in outcomes {
        if outcome.selected != DecisionOptionId::Yes {
            continue;
        }
        let proposal = proposals
            .get(outcome.target_change_id.as_str())
            .ok_or_else(|| ApplyServiceError::validation("Decision target has no proposal"))?;
        let bytes = render_memory_item_bytes(
            proposal,
            &document.frontmatter.proposal_id,
            decision_document_path,
            timestamp,
        )?;
        let final_path = outcome
            .memory_path
            .clone()
            .unwrap_or_else(|| memory_path_for_id(&proposal.memory.id));
        let staged_path = root
            .join(".kuku/knowledge/apply-tmp")
            .join(&document.frontmatter.id)
            .join(format!("{}.md", proposal.memory.id));
        let checksum = sha256_checksum_bytes(&bytes);
        planned.push(PlannedMemoryWrite {
            memory_id: proposal.memory.id.clone(),
            final_path,
            staged_path,
            bytes,
            checksum,
        });
    }
    Ok(planned)
}

fn render_memory_item_bytes(
    proposal: &MemoryProposalBlock,
    proposal_id: &str,
    decision_document_path: &str,
    timestamp: &str,
) -> Result<Vec<u8>, ApplyServiceError> {
    let item = MemoryItem {
        id: proposal.memory.id.clone(),
        kind: proposal.memory.kind.clone(),
        title: proposal.memory.title.clone(),
        status: MemoryStatus::Active,
        tags: proposal.memory.tags.clone(),
        source_refs: proposal.memory.source_refs.clone(),
        created_at: timestamp.to_string(),
        updated_at: timestamp.to_string(),
        proposal_id: proposal_id.to_string(),
        decision_document: decision_document_path.to_string(),
        body: proposal.memory.body.clone(),
    };
    let markdown = serialize_memory_item(&item)
        .map_err(|error| ApplyServiceError::validation(error.message))?;
    Ok(markdown.into_bytes())
}

async fn preflight_memory_paths(
    root: &Path,
    planned_writes: &[PlannedMemoryWrite],
) -> Result<(), ApplyServiceError> {
    let mut paths = BTreeSet::new();
    for planned in planned_writes {
        if !paths.insert(planned.final_path.as_str()) {
            return Err(ApplyServiceError::validation(format!(
                "Duplicate memory output path: {}",
                planned.final_path
            )));
        }
        let destination = root.join(&planned.final_path);
        if exact_or_case_insensitive_exists(&destination).await? {
            return Err(ApplyServiceError::already_exists(format!(
                "Memory output path already exists: {}",
                planned.final_path
            )));
        }
    }
    Ok(())
}

async fn stage_memory_file(planned: &PlannedMemoryWrite) -> Result<(), ApplyServiceError> {
    if let Some(parent) = planned.staged_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    }
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&planned.staged_path)
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    file.write_all(&planned.bytes)
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    file.sync_all()
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    drop(file);

    let staged = tokio::fs::read(&planned.staged_path)
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    if sha256_checksum_bytes(&staged) != planned.checksum {
        return Err(ApplyServiceError::io(format!(
            "Staged memory checksum verification failed for {}",
            planned.memory_id
        )));
    }
    Ok(())
}

async fn publish_memory_file(
    root: &Path,
    planned: &PlannedMemoryWrite,
) -> Result<(), ApplyServiceError> {
    let destination = root.join(&planned.final_path);
    if let Some(parent) = destination.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    }
    tokio::fs::hard_link(&planned.staged_path, &destination)
        .await
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                ApplyServiceError::already_exists(format!(
                    "Memory output path already exists: {}",
                    planned.final_path
                ))
            } else {
                ApplyServiceError::io(error.to_string())
            }
        })?;

    let published = tokio::fs::read(&destination)
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    if sha256_checksum_bytes(&published) != planned.checksum {
        return Err(ApplyServiceError::io(format!(
            "Published memory checksum verification failed for {}",
            planned.final_path
        )));
    }
    tokio::fs::remove_file(&planned.staged_path)
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    Ok(())
}

async fn cleanup_staging_dir(root: &Path, doc_id: &str) -> Result<(), ApplyServiceError> {
    let dir = root.join(".kuku/knowledge/apply-tmp").join(doc_id);
    match tokio::fs::remove_dir_all(&dir).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(ApplyServiceError::io(error.to_string())),
    }
}

fn journal_path(root: &Path, doc_id: &str) -> PathBuf {
    root.join(".kuku/knowledge/apply-journal")
        .join(format!("{doc_id}.json"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ApplyJournal {
    apply_id: String,
    doc_id: String,
    proposal_id: String,
    decision_document_path: String,
    decision_document_checksum_before: String,
    state: ApplyJournalState,
    planned_memory_paths: Vec<String>,
    created_paths: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    inflight_publish_path: Option<String>,
    finalized_memory_paths: Vec<String>,
    memory_checksums: BTreeMap<String, String>,
    decision_results: Vec<JournalDecisionResult>,
    created_at: String,
    updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl ApplyJournal {
    fn new(
        doc_id: &str,
        proposal_id: &str,
        decision_document_path: &str,
        decision_document_checksum_before: &str,
        planned_writes: &[PlannedMemoryWrite],
        outcomes: &[ZeroWriteOutcome],
        timestamp: &str,
    ) -> Self {
        Self {
            apply_id: format!("apply_{doc_id}_{}", timestamp.replace(['-', ':'], "")),
            doc_id: doc_id.to_string(),
            proposal_id: proposal_id.to_string(),
            decision_document_path: decision_document_path.to_string(),
            decision_document_checksum_before: decision_document_checksum_before.to_string(),
            state: ApplyJournalState::Staged,
            planned_memory_paths: planned_writes
                .iter()
                .map(|planned| planned.final_path.clone())
                .collect(),
            created_paths: vec![],
            inflight_publish_path: None,
            finalized_memory_paths: vec![],
            memory_checksums: BTreeMap::new(),
            decision_results: outcomes
                .iter()
                .map(JournalDecisionResult::from_outcome)
                .collect(),
            created_at: timestamp.to_string(),
            updated_at: timestamp.to_string(),
            error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum ApplyJournalState {
    Staged,
    Finalized,
    DocumentSaved,
    CleanupRequired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JournalDecisionResult {
    decision_id: String,
    target_change_id: String,
    selected_option_id: DecisionOptionId,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    memory_path: Option<String>,
}

impl JournalDecisionResult {
    fn from_outcome(outcome: &ZeroWriteOutcome) -> Self {
        let status = match outcome.selected {
            DecisionOptionId::Yes => "committed",
            DecisionOptionId::No => "rejected",
            DecisionOptionId::Other => "needs_revision",
        };
        Self {
            decision_id: outcome.decision_id.clone(),
            target_change_id: outcome.target_change_id.clone(),
            selected_option_id: outcome.selected.clone(),
            status: status.to_string(),
            memory_path: outcome.memory_path.clone(),
        }
    }
}

async fn write_journal_atomic(
    path: &Path,
    journal: &ApplyJournal,
) -> Result<(), ApplyServiceError> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    }
    let bytes = serde_json::to_vec_pretty(journal)
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    let tmp_path = path.with_extension("json.tmp");
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&tmp_path)
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    file.write_all(&bytes)
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    file.sync_all()
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    drop(file);
    tokio::fs::rename(&tmp_path, path)
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    Ok(())
}

async fn exact_or_case_insensitive_exists(path: &Path) -> Result<bool, ApplyServiceError> {
    match tokio::fs::try_exists(path).await {
        Ok(true) => return Ok(true),
        Ok(false) => {}
        Err(error) => return Err(ApplyServiceError::io(error.to_string())),
    }

    let Some(parent) = path.parent() else {
        return Ok(false);
    };
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return Ok(false);
    };
    let mut entries = match tokio::fs::read_dir(parent).await {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(ApplyServiceError::io(error.to_string())),
    };
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?
    {
        if entry
            .file_name()
            .to_str()
            .is_some_and(|candidate| candidate.eq_ignore_ascii_case(name))
        {
            return Ok(true);
        }
    }
    Ok(false)
}

async fn guarded_replace_file(
    destination: &Path,
    expected_checksum: String,
    bytes: &[u8],
) -> Result<(), ApplyServiceError> {
    let observed = tokio::fs::read(destination)
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    if sha256_checksum_bytes(&observed) != expected_checksum {
        return Err(ApplyServiceError::document_changed(
            "Decision document changed during apply",
        ));
    }

    let parent = destination.parent().ok_or_else(|| {
        ApplyServiceError::io("Decision document destination has no parent directory")
    })?;
    let tmp_path = parent.join(format!(
        ".{}.apply-tmp",
        destination
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("decision-document")
    ));

    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&tmp_path)
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    file.write_all(bytes)
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    file.sync_all()
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    drop(file);

    tokio::fs::rename(&tmp_path, destination)
        .await
        .map_err(|error| {
            let _ = std::fs::remove_file(&tmp_path);
            ApplyServiceError::io(error.to_string())
        })?;

    let written = tokio::fs::read(destination)
        .await
        .map_err(|error| ApplyServiceError::io(error.to_string()))?;
    if sha256_checksum_bytes(bytes) != sha256_checksum_bytes(&written) {
        return Err(ApplyServiceError::io(
            "Decision document write verification failed",
        ));
    }
    Ok(())
}

struct ApplyLock {
    path: PathBuf,
}

impl ApplyLock {
    async fn acquire(root: &Path, doc_id: &str) -> Result<Self, ApplyServiceError> {
        let lock_dir = root.join(".kuku/knowledge/apply-lock");
        tokio::fs::create_dir_all(&lock_dir)
            .await
            .map_err(|error| ApplyServiceError::io(error.to_string()))?;
        let lock_path = lock_dir.join(format!("{doc_id}.lock"));
        tokio::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&lock_path)
            .await
            .map_err(|error| {
                if error.kind() == std::io::ErrorKind::AlreadyExists {
                    ApplyServiceError::apply_in_progress(
                        "Decision document apply is already in progress",
                    )
                } else {
                    ApplyServiceError::io(error.to_string())
                }
            })?;
        Ok(Self { path: lock_path })
    }
}

impl Drop for ApplyLock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

struct DocumentWriteLock {
    path: PathBuf,
}

impl DocumentWriteLock {
    async fn acquire(root: &Path, relative_path: &str) -> Result<Self, ApplyServiceError> {
        let lock_dir = root.join(".kuku/knowledge/document-write-lock");
        tokio::fs::create_dir_all(&lock_dir)
            .await
            .map_err(|error| ApplyServiceError::io(error.to_string()))?;
        let lock_hash = hex::encode(Sha256::digest(relative_path.as_bytes()));
        let lock_path = lock_dir.join(format!("{lock_hash}.lock"));
        tokio::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&lock_path)
            .await
            .map_err(|error| {
                if error.kind() == std::io::ErrorKind::AlreadyExists {
                    ApplyServiceError::apply_in_progress(
                        "Decision document write is already in progress",
                    )
                } else {
                    ApplyServiceError::io(error.to_string())
                }
            })?;
        Ok(Self { path: lock_path })
    }
}

impl Drop for DocumentWriteLock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    use tauri::async_runtime;

    use super::*;
    use crate::knowledge::markdown::{parse_memory_item, sha256_checksum_bytes};

    static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

    #[test]
    fn one_yes_apply_writes_expected_memory_and_marks_applied() {
        let root = setup_vault(decision_document_with_memory_source_ref("yes"));
        let result = apply_fixture(&root).unwrap();

        assert_eq!(result.status, ApplyDecisionDocumentStatus::Applied);
        assert_eq!(
            result.committed_memory_paths,
            vec!["Knowledge/memory/mem_auth.md"]
        );
        assert!(result.rejected_decision_ids.is_empty());
        assert!(result.needs_revision_decision_ids.is_empty());
        assert_no_journal_or_temp_files(&root);

        let memory_markdown =
            fs::read_to_string(root.join("Knowledge/memory/mem_auth.md")).unwrap();
        let memory = parse_memory_item(&memory_markdown).unwrap();
        assert_eq!(memory.id, "mem_auth");
        assert_eq!(memory.title, "Auth decision");
        assert_eq!(memory.status, MemoryStatus::Active);
        assert_eq!(memory.proposal_id, "prop_auth");
        assert_eq!(memory.decision_document, "Knowledge/decisions/auth.md");
        assert_eq!(memory.body, "Use session cookie auth first.\n");
        assert_eq!(memory.source_refs.len(), 1);
        assert_eq!(memory.source_refs[0].path, "Notes/Auth.md");

        let updated = fs::read_to_string(root.join("Knowledge/decisions/auth.md")).unwrap();
        assert!(updated.contains("status: applied\n"));
        assert!(updated.contains("status: committed\n"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn mixed_yes_no_other_writes_only_yes_and_marks_partially_applied() {
        let root = setup_vault(yes_no_other_decision_document());
        let result = apply_fixture(&root).unwrap();

        assert_eq!(result.status, ApplyDecisionDocumentStatus::PartiallyApplied);
        assert_eq!(
            result.committed_memory_paths,
            vec!["Knowledge/memory/mem_auth.md"]
        );
        assert_eq!(result.rejected_decision_ids, vec!["decision_cache"]);
        assert_eq!(result.needs_revision_decision_ids, vec!["decision_policy"]);
        assert!(root.join("Knowledge/memory/mem_auth.md").is_file());
        assert!(!root.join("Knowledge/memory/mem_cache.md").exists());
        assert!(!root.join("Knowledge/memory/mem_policy.md").exists());
        assert_no_journal_or_temp_files(&root);

        let updated = fs::read_to_string(root.join("Knowledge/decisions/auth.md")).unwrap();
        assert!(updated.contains("status: partially_applied\n"));
        assert!(updated.contains("status: committed\n"));
        assert!(updated.contains("status: rejected\n"));
        assert!(updated.contains("status: needs_revision\n"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn yes_apply_rejects_existing_memory_before_journal() {
        let root = setup_vault(decision_document("yes", None));
        fs::write(root.join("Knowledge/memory/mem_auth.md"), "existing").unwrap();

        let error = apply_fixture(&root).unwrap_err();
        assert_eq!(error.code, KnowledgeErrorCode::ValidationFailed);
        assert!(root.join("Knowledge/memory/mem_auth.md").is_file());
        assert_no_journal_or_temp_files(&root);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn preflight_memory_paths_rejects_duplicate_planned_paths() {
        let root = temp_vault();
        let bytes = b"memory".to_vec();
        let planned = vec![
            PlannedMemoryWrite {
                memory_id: "mem_auth_a".to_string(),
                final_path: "Knowledge/memory/mem_auth.md".to_string(),
                staged_path: root.join(".kuku/knowledge/apply-tmp/doc_auth/mem_auth_a.md"),
                checksum: sha256_checksum_bytes(&bytes),
                bytes: bytes.clone(),
            },
            PlannedMemoryWrite {
                memory_id: "mem_auth_b".to_string(),
                final_path: "Knowledge/memory/mem_auth.md".to_string(),
                staged_path: root.join(".kuku/knowledge/apply-tmp/doc_auth/mem_auth_b.md"),
                checksum: sha256_checksum_bytes(&bytes),
                bytes,
            },
        ];

        let error = async_runtime::block_on(preflight_memory_paths(&root, &planned)).unwrap_err();
        assert_eq!(error.code, KnowledgeErrorCode::ValidationFailed);
        assert!(error.message.contains("Duplicate memory output path"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn preflight_memory_paths_rejects_case_insensitive_existing_path() {
        let root = temp_vault();
        fs::create_dir_all(root.join("Knowledge/memory")).unwrap();
        fs::write(root.join("Knowledge/memory/MEM_AUTH.md"), "existing").unwrap();

        let bytes = b"memory".to_vec();
        let planned = vec![PlannedMemoryWrite {
            memory_id: "mem_auth".to_string(),
            final_path: "Knowledge/memory/mem_auth.md".to_string(),
            staged_path: root.join(".kuku/knowledge/apply-tmp/doc_auth/mem_auth.md"),
            checksum: sha256_checksum_bytes(&bytes),
            bytes,
        }];

        let error = async_runtime::block_on(preflight_memory_paths(&root, &planned)).unwrap_err();
        assert_eq!(error.code, KnowledgeErrorCode::AlreadyExists);
        assert!(error.message.contains("Memory output path already exists"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn all_no_apply_writes_no_memory_and_marks_applied() {
        let root = setup_vault(decision_document("no", None));
        let result = apply_fixture(&root).unwrap();

        assert_eq!(result.status, ApplyDecisionDocumentStatus::Applied);
        assert_eq!(result.rejected_decision_ids, vec!["decision_auth"]);
        assert!(result.needs_revision_decision_ids.is_empty());
        assert_memory_dir_empty(&root);
        assert_no_journal_or_temp_files(&root);

        let updated = fs::read_to_string(root.join("Knowledge/decisions/auth.md")).unwrap();
        assert!(updated.contains("status: applied\n"));
        assert!(updated.contains("status: rejected\n"));
        assert!(updated.contains("resolved_at: "));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn all_other_apply_writes_no_memory_and_marks_needs_revision() {
        let root = setup_vault(decision_document(
            "other",
            Some("Use a different memory body."),
        ));
        let result = apply_fixture(&root).unwrap();

        assert_eq!(result.status, ApplyDecisionDocumentStatus::NeedsRevision);
        assert!(result.rejected_decision_ids.is_empty());
        assert_eq!(result.needs_revision_decision_ids, vec!["decision_auth"]);
        assert_memory_dir_empty(&root);
        assert_no_journal_or_temp_files(&root);

        let updated = fs::read_to_string(root.join("Knowledge/decisions/auth.md")).unwrap();
        assert!(updated.contains("status: needs_revision\n"));
        assert!(updated.contains("other_text: Use a different memory body."));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn mixed_no_other_apply_marks_needs_revision() {
        let root = setup_vault(mixed_decision_document());
        let result = apply_fixture(&root).unwrap();

        assert_eq!(result.status, ApplyDecisionDocumentStatus::NeedsRevision);
        assert_eq!(result.rejected_decision_ids, vec!["decision_auth"]);
        assert_eq!(result.needs_revision_decision_ids, vec!["decision_cache"]);
        assert_memory_dir_empty(&root);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn missing_selection_and_other_without_text_fail_before_write() {
        let root = setup_vault(decision_document_without_selection());
        let error = apply_fixture(&root).unwrap_err();
        assert_eq!(error.code, KnowledgeErrorCode::ValidationFailed);
        assert_memory_dir_empty(&root);
        let _ = fs::remove_dir_all(root);

        let root = setup_vault(decision_document("other", None));
        let error = apply_fixture(&root).unwrap_err();
        assert_eq!(error.code, KnowledgeErrorCode::ValidationFailed);
        assert_memory_dir_empty(&root);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn checksum_mismatch_returns_document_changed() {
        let root = setup_vault(decision_document("no", None));
        let mut request = apply_request(&root);
        request.expected_checksum =
            "sha256:0000000000000000000000000000000000000000000000000000000000000000".to_string();

        let error =
            async_runtime::block_on(apply_decision_document_for_root(&root, request)).unwrap_err();
        assert_eq!(error.code, KnowledgeErrorCode::DocumentChanged);
        assert_memory_dir_empty(&root);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn concurrent_apply_lock_blocks_apply() {
        let root = setup_vault(decision_document("no", None));
        fs::create_dir_all(root.join(".kuku/knowledge/apply-lock")).unwrap();
        fs::write(
            root.join(".kuku/knowledge/apply-lock/doc_auth.lock"),
            "locked",
        )
        .unwrap();

        let error = async_runtime::block_on(apply_decision_document_for_root(
            &root,
            apply_request(&root),
        ))
        .unwrap_err();
        assert_eq!(error.code, KnowledgeErrorCode::ApplyInProgress);
        assert_memory_dir_empty(&root);

        let _ = fs::remove_dir_all(root);
    }

    fn apply_fixture(root: &Path) -> Result<ApplyDecisionDocumentResult, ApplyServiceError> {
        async_runtime::block_on(apply_decision_document_for_root(root, apply_request(root)))
    }

    fn apply_request(root: &Path) -> ApplyDecisionDocumentRequest {
        let markdown = fs::read(root.join("Knowledge/decisions/auth.md")).unwrap();
        ApplyDecisionDocumentRequest {
            path: "Knowledge/decisions/auth.md".to_string(),
            expected_checksum: sha256_checksum_bytes(&markdown),
            source: "editor_document_apply".to_string(),
            recover: true,
        }
    }

    fn setup_vault(markdown: String) -> PathBuf {
        let root = temp_vault();
        fs::create_dir_all(root.join("Knowledge/decisions")).unwrap();
        fs::create_dir_all(root.join("Knowledge/memory")).unwrap();
        fs::create_dir_all(root.join(".kuku/knowledge/apply-journal")).unwrap();
        fs::create_dir_all(root.join(".kuku/knowledge/apply-tmp")).unwrap();
        fs::write(root.join("Knowledge/decisions/auth.md"), markdown).unwrap();
        root
    }

    fn assert_memory_dir_empty(root: &Path) {
        assert_eq!(
            fs::read_dir(root.join("Knowledge/memory")).unwrap().count(),
            0
        );
    }

    fn assert_no_journal_or_temp_files(root: &Path) {
        assert_eq!(
            fs::read_dir(root.join(".kuku/knowledge/apply-journal"))
                .unwrap()
                .count(),
            0
        );
        assert_eq!(
            fs::read_dir(root.join(".kuku/knowledge/apply-tmp"))
                .unwrap()
                .count(),
            0
        );
    }

    fn decision_document(selection: &str, other_text: Option<&str>) -> String {
        let other_text_yaml = other_text
            .map(|text| format!("other_text: {text}\n"))
            .unwrap_or_default();
        format!(
            "{}selected_option_id: {selection}\n{}{}",
            document_before_selection(),
            other_text_yaml,
            document_after_selection(),
        )
    }

    fn decision_document_with_memory_source_ref(selection: &str) -> String {
        decision_document(selection, None).replace(
            "  source_refs: []\n```\n\n```kuku-decision",
            concat!(
                "  source_refs:\n",
                "  - path: Notes/Auth.md\n",
                "    title: Auth Note\n",
                "    captured_at: 2026-05-07T00:00:00Z\n",
                "```\n\n```kuku-decision",
            ),
        )
    }

    fn decision_document_without_selection() -> String {
        format!(
            "{}{}",
            document_before_selection(),
            document_after_selection()
        )
    }

    fn mixed_decision_document() -> String {
        let mut document = decision_document("no", None);
        document.push_str(concat!(
            "\n```kuku-memory-proposal\n",
            "id: change_cache\n",
            "operation: create_memory\n",
            "memory:\n",
            "  id: mem_cache\n",
            "  title: Cache decision\n",
            "  tags: []\n",
            "  body: |-\n",
            "    Keep the cache local.\n",
            "  source_refs: []\n",
            "```\n",
            "\n```kuku-decision\n",
            "id: decision_cache\n",
            "proposal_id: prop_auth\n",
            "target_change_id: change_cache\n",
            "question: Remember this memory?\n",
            "selection_mode: single\n",
            "required: true\n",
            "status: pending\n",
            "selected_option_id: other\n",
            "options:\n",
            "- id: yes\n",
            "  label: Yes\n",
            "- id: no\n",
            "  label: No\n",
            "- id: other\n",
            "  label: Other\n",
            "  requires_input: true\n",
            "other_text: Needs a narrower cache policy.\n",
            "```\n",
        ));
        document
    }

    fn yes_no_other_decision_document() -> String {
        let mut document = decision_document("yes", None);
        document.push_str(concat!(
            "\n```kuku-memory-proposal\n",
            "id: change_cache\n",
            "operation: create_memory\n",
            "memory:\n",
            "  id: mem_cache\n",
            "  title: Cache decision\n",
            "  tags: []\n",
            "  body: |-\n",
            "    Keep the cache local.\n",
            "  source_refs: []\n",
            "```\n",
            "\n```kuku-decision\n",
            "id: decision_cache\n",
            "proposal_id: prop_auth\n",
            "target_change_id: change_cache\n",
            "question: Remember this memory?\n",
            "selection_mode: single\n",
            "required: true\n",
            "status: pending\n",
            "selected_option_id: no\n",
            "options:\n",
            "- id: yes\n",
            "  label: Yes\n",
            "- id: no\n",
            "  label: No\n",
            "- id: other\n",
            "  label: Other\n",
            "  requires_input: true\n",
            "```\n",
            "\n```kuku-memory-proposal\n",
            "id: change_policy\n",
            "operation: create_memory\n",
            "memory:\n",
            "  id: mem_policy\n",
            "  title: Policy decision\n",
            "  tags: []\n",
            "  body: |-\n",
            "    Keep the policy narrow.\n",
            "  source_refs: []\n",
            "```\n",
            "\n```kuku-decision\n",
            "id: decision_policy\n",
            "proposal_id: prop_auth\n",
            "target_change_id: change_policy\n",
            "question: Remember this memory?\n",
            "selection_mode: single\n",
            "required: true\n",
            "status: pending\n",
            "selected_option_id: other\n",
            "options:\n",
            "- id: yes\n",
            "  label: Yes\n",
            "- id: no\n",
            "  label: No\n",
            "- id: other\n",
            "  label: Other\n",
            "  requires_input: true\n",
            "other_text: Needs revision before saving.\n",
            "```\n",
        ));
        document
    }

    fn document_before_selection() -> &'static str {
        concat!(
            "---\n",
            "id: doc_auth\n",
            "proposal_id: prop_auth\n",
            "target_kind: memory\n",
            "request_source: ui_command\n",
            "status: pending\n",
            "created_at: 2026-05-07T00:00:00Z\n",
            "updated_at: 2026-05-07T00:00:00Z\n",
            "source_refs: []\n",
            "---\n",
            "\n",
            "```kuku-memory-proposal\n",
            "id: change_auth\n",
            "operation: create_memory\n",
            "memory:\n",
            "  id: mem_auth\n",
            "  title: Auth decision\n",
            "  tags: []\n",
            "  body: |-\n",
            "    Use session cookie auth first.\n",
            "  source_refs: []\n",
            "```\n",
            "\n",
            "```kuku-decision\n",
            "id: decision_auth\n",
            "proposal_id: prop_auth\n",
            "target_change_id: change_auth\n",
            "question: Remember this memory?\n",
            "selection_mode: single\n",
            "required: true\n",
            "status: pending\n",
        )
    }

    fn document_after_selection() -> &'static str {
        concat!(
            "options:\n",
            "- id: yes\n",
            "  label: Yes\n",
            "- id: no\n",
            "  label: No\n",
            "- id: other\n",
            "  label: Other\n",
            "  requires_input: true\n",
            "```\n",
        )
    }

    fn temp_vault() -> PathBuf {
        let mut path = std::env::temp_dir();
        let unique = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        path.push(format!("kuku-zero-apply-test-{nanos}-{unique}"));
        fs::create_dir_all(&path).unwrap();
        path
    }
}

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde_yaml::{Mapping, Value};
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

use crate::knowledge::decision_document::{
    DecisionBlock, DecisionDocumentError, ParsedKukuBlock, parse_decision_document,
    render_decision_document, validate_decision_document_integrity,
};
use crate::knowledge::markdown::{
    format_utc_timestamp, sha256_checksum_bytes, validate_safe_vault_relative_path,
    validate_sha256_checksum,
};
use crate::knowledge::models::{
    ApplyDecisionDocumentRequest, ApplyDecisionDocumentResult, ApplyDecisionDocumentStatus,
    DecisionOptionId, KnowledgeErrorCode,
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

    let outcomes = collect_zero_write_outcomes(&document)?;
    let document_status = document_status_for_zero_write(&outcomes);
    let resolved_at = format_utc_timestamp(SystemTime::now());
    apply_zero_write_updates(
        &mut document,
        &outcomes,
        document_status.as_str(),
        &resolved_at,
    )?;
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
    selected: DecisionOptionId,
}

fn collect_zero_write_outcomes(
    document: &crate::knowledge::decision_document::ParsedDecisionDocument,
) -> Result<Vec<ZeroWriteOutcome>, ApplyServiceError> {
    let mut outcomes = Vec::new();
    for decision in document.decision_blocks() {
        let selected = selected_decision_option(&decision.value)?;
        if selected == DecisionOptionId::Yes {
            return Err(ApplyServiceError::validation(
                "Yes decisions require memory finalization and are not supported by zero-write apply",
            ));
        }
        if selected == DecisionOptionId::Other {
            let other_text = decision.value.other_text.as_deref().unwrap_or_default();
            if other_text.trim().is_empty() {
                return Err(ApplyServiceError::validation(
                    "Other decisions require non-empty other_text",
                ));
            }
        }
        outcomes.push(ZeroWriteOutcome {
            decision_id: decision.value.id.clone(),
            selected,
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

fn document_status_for_zero_write(outcomes: &[ZeroWriteOutcome]) -> ApplyDecisionDocumentStatus {
    if outcomes
        .iter()
        .any(|outcome| outcome.selected == DecisionOptionId::Other)
    {
        ApplyDecisionDocumentStatus::NeedsRevision
    } else {
        ApplyDecisionDocumentStatus::Applied
    }
}

fn apply_zero_write_updates(
    document: &mut crate::knowledge::decision_document::ParsedDecisionDocument,
    outcomes: &[ZeroWriteOutcome],
    document_status: &str,
    resolved_at: &str,
) -> Result<(), ApplyServiceError> {
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
        if rejected.contains(decision.value.id.as_str()) {
            decision.value.status = "rejected".to_string();
            decision.value.resolved_at = Some(resolved_at.to_string());
        } else if needs_revision.contains(decision.value.id.as_str()) {
            decision.value.status = "needs_revision".to_string();
            decision.value.resolved_at = Some(resolved_at.to_string());
        }
    }

    Ok(())
}

fn set_frontmatter_string(frontmatter: &mut Mapping, key: &str, value: &str) {
    frontmatter.insert(
        Value::String(key.to_string()),
        Value::String(value.to_string()),
    );
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
    use crate::knowledge::markdown::sha256_checksum_bytes;

    static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

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

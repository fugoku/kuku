use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::mpsc::{self, Sender};
use std::time::{SystemTime, UNIX_EPOCH};

use parking_lot::Mutex;

use kuku_search_core::extract_document;
use rusqlite::Connection;

use crate::models::IndexerStatus;
use crate::search::db::{
    IndexedChunkRow, IndexedDocument, list_indexed_doc_ids, open_connection, remove_document,
    replace_document,
};
use crate::search::{RebuildQueueState, is_markdown_path, to_relative_path};
use crate::vault::should_ignore_path;

#[derive(Debug, Clone)]
pub enum WriterJob {
    FullRebuild,
    IndexFile {
        path: String,
    },
    RemoveFile {
        path: String,
        is_dir: bool,
    },
    RenameFile {
        old_path: String,
        new_path: String,
        is_dir: bool,
    },
    Shutdown,
}

pub fn start_writer_thread(
    vault_root: PathBuf,
    db_path: PathBuf,
    status: Arc<Mutex<IndexerStatus>>,
    rebuild_state: Arc<Mutex<RebuildQueueState>>,
) -> Sender<WriterJob> {
    let (job_tx, job_rx) = mpsc::channel::<WriterJob>();
    let loop_tx = job_tx.clone();

    std::thread::spawn(move || {
        let mut conn = match open_connection(&db_path) {
            Ok(conn) => conn,
            Err(error) => {
                let mut guard = status.lock();
                guard.state = "error".to_string();
                guard.error = Some(error);
                return;
            }
        };

        while let Ok(job) = job_rx.recv() {
            if matches!(job, WriterJob::Shutdown) {
                break;
            }

            let is_full_rebuild = matches!(&job, WriterJob::FullRebuild);
            let result = match job {
                WriterJob::FullRebuild => {
                    handle_full_rebuild(&mut conn, &vault_root, &status, &rebuild_state, &loop_tx)
                }
                WriterJob::IndexFile { path } => {
                    handle_index_file(&mut conn, &vault_root, &path, &status)
                }
                WriterJob::RemoveFile { path, is_dir } => {
                    handle_remove_file(&mut conn, &path, is_dir, &status, &rebuild_state, &loop_tx)
                }
                WriterJob::RenameFile {
                    old_path,
                    new_path,
                    is_dir,
                } => handle_rename_file(
                    &mut conn,
                    &vault_root,
                    &old_path,
                    &new_path,
                    is_dir,
                    &status,
                    &rebuild_state,
                    &loop_tx,
                ),
                WriterJob::Shutdown => Ok(()),
            };

            if let Err(error) = result {
                if is_full_rebuild {
                    reset_rebuild_state_after_error(&rebuild_state);
                }
                let mut guard = status.lock();
                guard.state = "error".to_string();
                guard.error = Some(error);
            }
        }
    });

    job_tx
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn set_indexing_status(status: &Arc<Mutex<IndexerStatus>>, total_docs: usize, indexed_docs: usize) {
    let mut guard = status.lock();
    guard.state = "indexing".to_string();
    guard.total_docs = total_docs;
    guard.indexed_docs = indexed_docs;
    guard.error = None;
}

fn set_idle_status(status: &Arc<Mutex<IndexerStatus>>, total_docs: usize) {
    let mut guard = status.lock();
    guard.state = "idle".to_string();
    guard.total_docs = total_docs;
    guard.indexed_docs = total_docs;
    guard.last_indexed_at = Some(now_ms());
    guard.error = None;
}

fn status_progress(status: &Arc<Mutex<IndexerStatus>>) -> (usize, usize) {
    let guard = status.lock();
    (guard.total_docs, guard.indexed_docs)
}

fn reset_rebuild_state_after_error(rebuild_state: &Arc<Mutex<RebuildQueueState>>) {
    let mut guard = rebuild_state.lock();
    guard.queued = false;
    guard.running = false;
    guard.rerun = false;
}

fn collect_markdown_files(dir: &Path, root: &Path, out: &mut Vec<String>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read vault directory: {e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read vault entry: {e}"))?;
        let path = entry.path();
        let rel = path
            .strip_prefix(root)
            .map_err(|e| format!("Failed to strip root prefix: {e}"))?;
        if should_ignore_path(rel) {
            continue;
        }
        if path.is_dir() {
            collect_markdown_files(&path, root, out)?;
            continue;
        }

        let rel_string = to_relative_path(root, &path);
        if is_markdown_path(&rel_string) {
            out.push(rel_string);
        }
    }
    Ok(())
}

fn mtime_ms(path: &Path) -> i64 {
    fs::metadata(path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_else(now_ms)
}

fn build_document(root: &Path, rel_path: &str) -> Result<Option<IndexedDocument>, String> {
    if !is_markdown_path(rel_path) {
        return Ok(None);
    }

    let absolute = root.join(rel_path);
    if !absolute.exists() {
        return Ok(None);
    }

    let markdown =
        fs::read_to_string(&absolute).map_err(|e| format!("Failed to read markdown file: {e}"))?;
    let extracted = extract_document(&markdown);
    let meta_json = serde_json::to_string(
        &extracted
            .frontmatter
            .iter()
            .map(|entry| (entry.key.clone(), entry.value.clone()))
            .collect::<std::collections::BTreeMap<_, _>>(),
    )
    .map_err(|e| format!("Failed to serialize frontmatter: {e}"))?;

    let mut chunks = Vec::new();
    for section in extracted.sections {
        let section_path_json = serde_json::to_string(&section.path)
            .map_err(|e| format!("Failed to encode section path: {e}"))?;
        for chunk in section.chunks {
            chunks.push(IndexedChunkRow {
                section_path_json: section_path_json.clone(),
                kind: chunk.kind.as_str().to_string(),
                text: chunk.text,
                raw_text: chunk.raw_text,
                global_start: chunk.global_start as i64,
                global_end: chunk.global_end as i64,
            });
        }
    }

    Ok(Some(IndexedDocument {
        doc_id: rel_path.to_string(),
        title: extracted.title,
        mtime_ms: mtime_ms(&absolute),
        meta_json,
        chunks,
    }))
}

fn handle_full_rebuild(
    conn: &mut Connection,
    vault_root: &Path,
    status: &Arc<Mutex<IndexerStatus>>,
    rebuild_state: &Arc<Mutex<RebuildQueueState>>,
    loop_tx: &Sender<WriterJob>,
) -> Result<(), String> {
    {
        let mut guard = rebuild_state.lock();
        guard.queued = false;
        guard.running = true;
    }

    let mut files = Vec::new();
    collect_markdown_files(vault_root, vault_root, &mut files)?;
    files.sort();

    set_indexing_status(status, files.len(), 0);

    for (batch_idx, batch) in files.chunks(50).enumerate() {
        let mut docs = Vec::new();
        for rel_path in batch {
            if let Some(doc) = build_document(vault_root, rel_path)? {
                docs.push(doc);
            }
        }

        let tx = conn
            .transaction()
            .map_err(|e| format!("Failed to open rebuild transaction: {e}"))?;
        for doc in &docs {
            replace_document(&tx, doc)?;
        }
        tx.commit()
            .map_err(|e| format!("Failed to commit rebuild batch: {e}"))?;

        set_indexing_status(
            status,
            files.len(),
            usize::min((batch_idx + 1) * 50, files.len()),
        );
    }

    let current_doc_ids: HashSet<String> = files.iter().cloned().collect();
    let indexed_doc_ids = list_indexed_doc_ids(conn)?;
    let stale_doc_ids = indexed_doc_ids
        .into_iter()
        .filter(|doc_id| !current_doc_ids.contains(doc_id))
        .collect::<Vec<_>>();

    if !stale_doc_ids.is_empty() {
        let tx = conn
            .transaction()
            .map_err(|e| format!("Failed to open stale cleanup transaction: {e}"))?;
        for doc_id in stale_doc_ids {
            remove_document(&tx, &doc_id)?;
        }
        tx.commit()
            .map_err(|e| format!("Failed to commit stale cleanup transaction: {e}"))?;
    }

    set_idle_status(status, files.len());

    let should_rerun = {
        let mut guard = rebuild_state.lock();
        guard.running = false;
        if guard.rerun {
            guard.rerun = false;
            guard.queued = true;
            true
        } else {
            false
        }
    };

    if should_rerun {
        let _ = loop_tx.send(WriterJob::FullRebuild);
    }

    Ok(())
}

fn handle_index_file(
    conn: &mut Connection,
    vault_root: &Path,
    path: &str,
    status: &Arc<Mutex<IndexerStatus>>,
) -> Result<(), String> {
    if !is_markdown_path(path) {
        return Ok(());
    }

    let (total_docs, indexed_docs) = status_progress(status);
    set_indexing_status(status, total_docs, indexed_docs);
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to open index transaction: {e}"))?;
    match build_document(vault_root, path)? {
        Some(doc) => replace_document(&tx, &doc)?,
        None => remove_document(&tx, path)?,
    }
    tx.commit()
        .map_err(|e| format!("Failed to commit index transaction: {e}"))?;

    let total = list_indexed_doc_ids(conn)?.len();
    set_idle_status(status, total);
    Ok(())
}

fn handle_remove_file(
    conn: &mut Connection,
    path: &str,
    is_dir: bool,
    _status: &Arc<Mutex<IndexerStatus>>,
    rebuild_state: &Arc<Mutex<RebuildQueueState>>,
    loop_tx: &Sender<WriterJob>,
) -> Result<(), String> {
    if is_dir {
        queue_rebuild(rebuild_state, loop_tx);
        return Ok(());
    }

    if !is_markdown_path(path) {
        return Ok(());
    }

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to open remove transaction: {e}"))?;
    remove_document(&tx, path)?;
    tx.commit()
        .map_err(|e| format!("Failed to commit remove transaction: {e}"))?;
    Ok(())
}

fn handle_rename_file(
    conn: &mut Connection,
    vault_root: &Path,
    old_path: &str,
    new_path: &str,
    is_dir: bool,
    status: &Arc<Mutex<IndexerStatus>>,
    rebuild_state: &Arc<Mutex<RebuildQueueState>>,
    loop_tx: &Sender<WriterJob>,
) -> Result<(), String> {
    if is_dir {
        queue_rebuild(rebuild_state, loop_tx);
        return Ok(());
    }

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to open rename transaction: {e}"))?;
    if is_markdown_path(old_path) {
        remove_document(&tx, old_path)?;
    }
    if is_markdown_path(new_path) {
        if let Some(doc) = build_document(vault_root, new_path)? {
            replace_document(&tx, &doc)?;
        }
    }
    tx.commit()
        .map_err(|e| format!("Failed to commit rename transaction: {e}"))?;
    let total = list_indexed_doc_ids(conn)?.len();
    set_idle_status(status, total);
    Ok(())
}

pub fn queue_rebuild(rebuild_state: &Arc<Mutex<RebuildQueueState>>, job_tx: &Sender<WriterJob>) {
    let should_send = {
        let mut guard = rebuild_state.lock();
        if guard.running {
            guard.rerun = true;
            false
        } else if guard.queued {
            false
        } else {
            guard.queued = true;
            true
        }
    };

    if should_send {
        let _ = job_tx.send(WriterJob::FullRebuild);
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::thread;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    use super::*;

    static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn unique_path(prefix: &str) -> PathBuf {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let suffix = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!("{prefix}-{now}-{suffix}"))
    }

    #[test]
    fn failed_rebuild_does_not_leave_queue_stuck() {
        let missing_root = unique_path("kuku-missing-root");
        let db_path = unique_path("kuku-search-db").with_extension("sqlite3");
        let status = Arc::new(Mutex::new(IndexerStatus::default()));
        let rebuild_state = Arc::new(Mutex::new(RebuildQueueState::default()));
        let job_tx =
            start_writer_thread(missing_root, db_path, status.clone(), rebuild_state.clone());

        queue_rebuild(&rebuild_state, &job_tx);

        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        while std::time::Instant::now() < deadline {
            if status.lock().state == "error" {
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }

        assert_eq!(status.lock().state, "error");
        let guard = rebuild_state.lock();
        assert!(!guard.running);
        assert!(!guard.queued);
        assert!(!guard.rerun);

        let _ = job_tx.send(WriterJob::Shutdown);
    }

    #[test]
    fn index_file_job_completes_for_new_file() {
        let root = unique_path("kuku-index-root");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("note.md"), "# Title\nhello search world").unwrap();

        let db_path = unique_path("kuku-index-db").with_extension("sqlite3");
        let status = Arc::new(Mutex::new(IndexerStatus::default()));
        let rebuild_state = Arc::new(Mutex::new(RebuildQueueState::default()));
        let job_tx = start_writer_thread(root.clone(), db_path, status.clone(), rebuild_state);

        job_tx
            .send(WriterJob::IndexFile {
                path: "note.md".to_string(),
            })
            .unwrap();

        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        while std::time::Instant::now() < deadline {
            let current = status.lock().clone();
            if current.state == "idle" && current.total_docs == 1 {
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }

        let current = status.lock().clone();
        assert_eq!(current.state, "idle");
        assert_eq!(current.total_docs, 1);
        assert_eq!(current.indexed_docs, 1);

        let _ = job_tx.send(WriterJob::Shutdown);
    }
}

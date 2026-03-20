use std::path::Path;

use rusqlite::{Connection, Transaction, params};

use crate::models::SimpleSearchHit;

#[derive(Debug, Clone)]
pub struct IndexedChunkRow {
    pub section_path_json: String,
    pub kind: String,
    pub text: String,
    pub raw_text: String,
    pub global_start: i64,
    pub global_end: i64,
}

#[derive(Debug, Clone)]
pub struct IndexedDocument {
    pub doc_id: String,
    pub title: Option<String>,
    pub mtime_ms: i64,
    pub meta_json: String,
    pub chunks: Vec<IndexedChunkRow>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdvancedTitleRow {
    pub doc_id: String,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdvancedBodyRow {
    pub doc_id: String,
    pub title: Option<String>,
    pub section_path: Vec<String>,
    pub section_ordinal: usize,
    pub kind: String,
    pub raw_text: String,
    pub global_start: i64,
}

pub fn open_connection(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| format!("Failed to open search DB: {e}"))?;
    configure_connection(&conn)?;
    init_schema(&conn)?;
    Ok(conn)
}

pub fn configure_connection(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA busy_timeout = 5000;
        "#,
    )
    .map_err(|e| format!("Failed to configure search DB: {e}"))
}

pub fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS documents (
            doc_id TEXT PRIMARY KEY,
            title TEXT,
            mtime_ms INTEGER NOT NULL,
            meta_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chunk_rows (
            rowid INTEGER PRIMARY KEY,
            doc_id TEXT NOT NULL,
            section_path TEXT NOT NULL,
            kind TEXT NOT NULL,
            text TEXT NOT NULL,
            raw_text TEXT NOT NULL,
            global_start INTEGER NOT NULL,
            global_end INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_chunk_doc ON chunk_rows(doc_id);

        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
            doc_id UNINDEXED,
            section_path,
            kind UNINDEXED,
            text,
            content = 'chunk_rows',
            content_rowid = 'rowid',
            tokenize = 'unicode61',
            prefix = '2 3 4'
        );

        CREATE TRIGGER IF NOT EXISTS chunk_rows_ai AFTER INSERT ON chunk_rows BEGIN
          INSERT INTO chunks_fts(rowid, doc_id, section_path, kind, text)
          VALUES (new.rowid, new.doc_id, new.section_path, new.kind, new.text);
        END;

        CREATE TRIGGER IF NOT EXISTS chunk_rows_ad AFTER DELETE ON chunk_rows BEGIN
          INSERT INTO chunks_fts(chunks_fts, rowid, doc_id, section_path, kind, text)
          VALUES ('delete', old.rowid, old.doc_id, old.section_path, old.kind, old.text);
        END;

        CREATE TRIGGER IF NOT EXISTS chunk_rows_au AFTER UPDATE ON chunk_rows BEGIN
          INSERT INTO chunks_fts(chunks_fts, rowid, doc_id, section_path, kind, text)
          VALUES ('delete', old.rowid, old.doc_id, old.section_path, old.kind, old.text);
          INSERT INTO chunks_fts(rowid, doc_id, section_path, kind, text)
          VALUES (new.rowid, new.doc_id, new.section_path, new.kind, new.text);
        END;
        "#,
    )
    .map_err(|e| format!("Failed to initialize search schema: {e}"))
}

pub fn replace_document(tx: &Transaction<'_>, doc: &IndexedDocument) -> Result<(), String> {
    tx.execute("DELETE FROM chunk_rows WHERE doc_id = ?", [&doc.doc_id])
        .map_err(|e| format!("Failed to delete existing chunks: {e}"))?;
    tx.execute("DELETE FROM documents WHERE doc_id = ?", [&doc.doc_id])
        .map_err(|e| format!("Failed to delete existing document: {e}"))?;

    tx.execute(
        "INSERT INTO documents (doc_id, title, mtime_ms, meta_json) VALUES (?, ?, ?, ?)",
        params![doc.doc_id, doc.title, doc.mtime_ms, doc.meta_json],
    )
    .map_err(|e| format!("Failed to insert document: {e}"))?;

    for chunk in &doc.chunks {
        tx.execute(
            "INSERT INTO chunk_rows (doc_id, section_path, kind, text, raw_text, global_start, global_end)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![
                doc.doc_id,
                chunk.section_path_json,
                chunk.kind,
                chunk.text,
                chunk.raw_text,
                chunk.global_start,
                chunk.global_end
            ],
        )
        .map_err(|e| format!("Failed to insert chunk: {e}"))?;
    }

    Ok(())
}

pub fn remove_document(tx: &Transaction<'_>, doc_id: &str) -> Result<(), String> {
    tx.execute("DELETE FROM chunk_rows WHERE doc_id = ?", [doc_id])
        .map_err(|e| format!("Failed to delete chunks: {e}"))?;
    tx.execute("DELETE FROM documents WHERE doc_id = ?", [doc_id])
        .map_err(|e| format!("Failed to delete document: {e}"))?;
    Ok(())
}

pub fn list_indexed_doc_ids(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT doc_id FROM documents")
        .map_err(|e| format!("Failed to list docs: {e}"))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Failed to query docs: {e}"))?;

    let mut ids = Vec::new();
    for row in rows {
        ids.push(row.map_err(|e| format!("Failed to read doc row: {e}"))?);
    }
    Ok(ids)
}

pub fn query_metadata_hits(
    conn: &Connection,
    normalized_query: &str,
    limit: usize,
) -> Result<Vec<SimpleSearchHit>, String> {
    let like = format!("%{normalized_query}%");
    let mut stmt = conn
        .prepare(
            r#"
            SELECT doc_id, title, meta_json
            FROM documents
            WHERE lower(COALESCE(title, '')) LIKE ?1
               OR lower(COALESCE(meta_json, '')) LIKE ?1
            ORDER BY doc_id ASC
            LIMIT ?2
            "#,
        )
        .map_err(|e| format!("Failed to prepare metadata query: {e}"))?;

    let rows = stmt
        .query_map(params![like, limit as i64], |row| {
            let doc_id: String = row.get(0)?;
            let title: Option<String> = row.get(1)?;
            let meta_json: String = row.get(2)?;
            Ok(SimpleSearchHit {
                doc_id,
                title: title.clone(),
                section_path: Vec::new(),
                section_ordinal: 0,
                snippet: title.unwrap_or(meta_json),
                kind: "Heading".to_string(),
                score: 1_000_000.0,
            })
        })
        .map_err(|e| format!("Failed to execute metadata query: {e}"))?;

    let mut hits = Vec::new();
    for row in rows {
        hits.push(row.map_err(|e| format!("Failed to read metadata hit: {e}"))?);
    }
    Ok(hits)
}

pub fn query_body_hits(
    conn: &Connection,
    fts_query: &str,
    limit: usize,
    snippet_builder: impl Fn(&str) -> String,
) -> Result<Vec<SimpleSearchHit>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT
                cr.doc_id,
                d.title,
                cr.section_path,
                CASE
                    WHEN cr.section_path = '[]' THEN 0
                    ELSE MAX(0, (
                        SELECT COUNT(*)
                        FROM chunk_rows anchors
                        WHERE anchors.doc_id = cr.doc_id
                          AND anchors.section_path = cr.section_path
                          AND anchors.kind = 'Heading'
                          AND anchors.global_start <= cr.global_start
                    ) - 1)
                END AS section_ordinal,
                cr.kind,
                cr.raw_text,
                -bm25(chunks_fts) AS score
            FROM chunks_fts
            JOIN chunk_rows cr ON cr.rowid = chunks_fts.rowid
            LEFT JOIN documents d ON d.doc_id = cr.doc_id
            WHERE chunks_fts MATCH ?1
            ORDER BY score DESC, cr.doc_id ASC
            LIMIT ?2
            "#,
        )
        .map_err(|e| format!("Failed to prepare body query: {e}"))?;

    let rows = stmt
        .query_map(params![fts_query, limit as i64], |row| {
            let doc_id: String = row.get(0)?;
            let title: Option<String> = row.get(1)?;
            let section_path_json: String = row.get(2)?;
            let section_ordinal: usize = row.get(3)?;
            let kind: String = row.get(4)?;
            let raw_text: String = row.get(5)?;
            let score: f64 = row.get(6)?;
            let section_path =
                serde_json::from_str::<Vec<String>>(&section_path_json).unwrap_or_default();
            Ok(SimpleSearchHit {
                doc_id,
                title,
                section_path,
                section_ordinal,
                snippet: snippet_builder(&raw_text),
                kind,
                score,
            })
        })
        .map_err(|e| format!("Failed to execute body query: {e}"))?;

    let mut hits = Vec::new();
    for row in rows {
        hits.push(row.map_err(|e| format!("Failed to read body hit: {e}"))?);
    }
    Ok(hits)
}

pub fn visit_advanced_title_rows(
    conn: &Connection,
    mut visit: impl FnMut(AdvancedTitleRow) -> Result<bool, String>,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT doc_id, title
            FROM documents
            WHERE title IS NOT NULL AND title <> ''
            ORDER BY doc_id ASC
            "#,
        )
        .map_err(|e| format!("Failed to prepare advanced title query: {e}"))?;

    let mut rows = stmt
        .query([])
        .map_err(|e| format!("Failed to execute advanced title query: {e}"))?;

    while let Some(row) = rows
        .next()
        .map_err(|e| format!("Failed to read advanced title row: {e}"))?
    {
        let should_continue = visit(AdvancedTitleRow {
            doc_id: row
                .get(0)
                .map_err(|e| format!("Failed to read advanced title row: {e}"))?,
            title: row
                .get(1)
                .map_err(|e| format!("Failed to read advanced title row: {e}"))?,
        })?;
        if !should_continue {
            break;
        }
    }
    Ok(())
}

#[cfg(test)]
pub fn load_advanced_title_rows(conn: &Connection) -> Result<Vec<AdvancedTitleRow>, String> {
    let mut titles = Vec::new();
    visit_advanced_title_rows(conn, |row| {
        titles.push(row);
        Ok(true)
    })?;
    Ok(titles)
}

pub fn visit_advanced_body_rows(
    conn: &Connection,
    mut visit: impl FnMut(AdvancedBodyRow) -> Result<bool, String>,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT
                cr.doc_id,
                d.title,
                cr.section_path,
                cr.kind,
                cr.raw_text,
                cr.global_start
            FROM chunk_rows cr
            LEFT JOIN documents d ON d.doc_id = cr.doc_id
            ORDER BY cr.doc_id ASC, cr.section_path ASC, cr.global_start ASC
            "#,
        )
        .map_err(|e| format!("Failed to prepare advanced body query: {e}"))?;

    let mut rows = stmt
        .query([])
        .map_err(|e| format!("Failed to execute advanced body query: {e}"))?;
    let mut current_key: Option<(String, String)> = None;
    let mut heading_count = 0usize;

    while let Some(row) = rows
        .next()
        .map_err(|e| format!("Failed to read advanced body row: {e}"))?
    {
        let doc_id: String = row
            .get(0)
            .map_err(|e| format!("Failed to read advanced body row: {e}"))?;
        let title: Option<String> = row
            .get(1)
            .map_err(|e| format!("Failed to read advanced body row: {e}"))?;
        let section_path_json: String = row
            .get(2)
            .map_err(|e| format!("Failed to read advanced body row: {e}"))?;
        let kind: String = row
            .get(3)
            .map_err(|e| format!("Failed to read advanced body row: {e}"))?;
        let raw_text: String = row
            .get(4)
            .map_err(|e| format!("Failed to read advanced body row: {e}"))?;
        let global_start: i64 = row
            .get(5)
            .map_err(|e| format!("Failed to read advanced body row: {e}"))?;
        let section_path =
            serde_json::from_str::<Vec<String>>(&section_path_json).unwrap_or_default();
        let key = (doc_id.clone(), section_path_json);
        if current_key.as_ref() != Some(&key) {
            current_key = Some(key);
            heading_count = 0;
        }

        let section_ordinal = if section_path.is_empty() {
            0
        } else if kind == "Heading" {
            let ordinal = heading_count;
            heading_count += 1;
            ordinal
        } else {
            heading_count.saturating_sub(1)
        };

        let should_continue = visit(AdvancedBodyRow {
            doc_id,
            title,
            section_path,
            section_ordinal,
            kind,
            raw_text,
            global_start,
        })?;
        if !should_continue {
            break;
        }
    }
    Ok(())
}

#[cfg(test)]
pub fn load_advanced_body_rows(conn: &Connection) -> Result<Vec<AdvancedBodyRow>, String> {
    let mut body_rows = Vec::new();
    visit_advanced_body_rows(conn, |row| {
        body_rows.push(row);
        Ok(true)
    })?;
    Ok(body_rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn external_content_trigger_sync_removes_deleted_rows() {
        let conn = Connection::open_in_memory().unwrap();
        configure_connection(&conn).unwrap();
        init_schema(&conn).unwrap();

        conn.execute(
            "INSERT INTO documents (doc_id, title, mtime_ms, meta_json) VALUES ('a.md', 'A', 1, '{}')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO chunk_rows (doc_id, section_path, kind, text, raw_text, global_start, global_end)
             VALUES ('a.md', '[]', 'Prose', 'hello world', 'hello world', 0, 11)",
            [],
        )
        .unwrap();
        conn.execute("DELETE FROM chunk_rows WHERE doc_id = 'a.md'", [])
            .unwrap();

        let exists = query_body_hits(&conn, "hello*", 10, |raw| raw.to_string()).unwrap();
        assert!(exists.is_empty());
    }

    #[test]
    fn advanced_materialization_preserves_sort_fields() {
        let mut conn = Connection::open_in_memory().unwrap();
        configure_connection(&conn).unwrap();
        init_schema(&conn).unwrap();

        let tx = conn.transaction().unwrap();
        replace_document(
            &tx,
            &IndexedDocument {
                doc_id: "note.md".to_string(),
                title: Some("Alpha Title".to_string()),
                mtime_ms: 1,
                meta_json: "{}".to_string(),
                chunks: vec![IndexedChunkRow {
                    section_path_json: serde_json::to_string(&vec!["Section".to_string()]).unwrap(),
                    kind: "Prose".to_string(),
                    text: "alpha body".to_string(),
                    raw_text: "Alpha body".to_string(),
                    global_start: 12,
                    global_end: 22,
                }],
            },
        )
        .unwrap();
        tx.commit().unwrap();

        let titles = load_advanced_title_rows(&conn).unwrap();
        let body_rows = load_advanced_body_rows(&conn).unwrap();

        assert_eq!(
            titles,
            vec![AdvancedTitleRow {
                doc_id: "note.md".to_string(),
                title: "Alpha Title".to_string(),
            }]
        );
        assert_eq!(body_rows.len(), 1);
        assert_eq!(body_rows[0].section_path, vec!["Section".to_string()]);
        assert_eq!(body_rows[0].section_ordinal, 0);
        assert_eq!(body_rows[0].global_start, 12);
    }
}

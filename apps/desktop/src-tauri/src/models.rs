use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChangeEvent {
    /// "create" | "modify" | "delete" | "rename"
    pub kind: String,
    /// For rename: the destination path
    pub path: String,
    pub is_dir: bool,
    /// For rename: the original path
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileReadResult {
    pub content: String,
    pub checksum: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status")]
pub enum ChecksumWriteResult {
    Written { checksum: String },
    Conflict { expected: String, actual: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexerStatus {
    pub state: String,
    pub total_docs: usize,
    pub indexed_docs: usize,
    pub last_indexed_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl Default for IndexerStatus {
    fn default() -> Self {
        Self {
            state: "idle".to_string(),
            total_docs: 0,
            indexed_docs: 0,
            last_indexed_at: None,
            error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleSearchHit {
    pub doc_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub section_path: Vec<String>,
    pub section_ordinal: usize,
    pub snippet: String,
    pub kind: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleSearchResult {
    pub query: String,
    pub total: usize,
    pub items: Vec<SimpleSearchHit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedQueryRequest {
    pub query: String,
    pub case_sensitive: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_results: Option<usize>,
}

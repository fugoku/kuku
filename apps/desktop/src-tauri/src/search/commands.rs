use tauri::{State, command};

use crate::models::{AdvancedQueryRequest, IndexerStatus, SimpleSearchResult};

use super::SearchState;

#[command]
pub async fn search_query_simple(
    state: State<'_, SearchState>,
    query: String,
    max_results: Option<usize>,
) -> Result<SimpleSearchResult, String> {
    state.query_simple(&query, max_results.unwrap_or(20))
}

#[command]
pub async fn search_query_advanced(
    state: State<'_, SearchState>,
    request: AdvancedQueryRequest,
) -> Result<SimpleSearchResult, String> {
    state.query_advanced(&request)
}

#[command]
pub async fn search_get_status(state: State<'_, SearchState>) -> Result<IndexerStatus, String> {
    Ok(state.get_status())
}

#[command]
pub async fn search_request_rebuild(state: State<'_, SearchState>) -> Result<(), String> {
    state.request_rebuild()
}

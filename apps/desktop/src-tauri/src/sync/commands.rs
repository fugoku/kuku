use tauri::{AppHandle, Emitter, State, command};

use super::SyncState;
use super::db;
use super::errors::command_error;
use super::types::{
    SYNC_STATUS_EVENT, SyncConflictSummary, SyncRuntimeStatus, SyncStatusEvent, SyncVaultConfig,
};

#[command]
pub async fn sync_get_status(state: State<'_, SyncState>) -> Result<SyncRuntimeStatus, String> {
    status_with_conflicts(&state).map_err(command_error)
}

#[command]
pub async fn sync_configure_vault(
    app: AppHandle,
    state: State<'_, SyncState>,
    config: SyncVaultConfig,
) -> Result<SyncRuntimeStatus, String> {
    let status = state.configure_vault(config).map_err(command_error)?;
    emit_status(&app, &status);
    Ok(status)
}

#[command]
pub async fn sync_set_enabled(
    app: AppHandle,
    state: State<'_, SyncState>,
    enabled: bool,
) -> Result<SyncRuntimeStatus, String> {
    let status = state.set_enabled(enabled).map_err(command_error)?;
    emit_status(&app, &status);
    Ok(status)
}

#[command]
pub async fn sync_run_once(
    app: AppHandle,
    state: State<'_, SyncState>,
) -> Result<SyncRuntimeStatus, String> {
    let conflict_count = list_open_conflicts_for_status(&state)
        .map_err(command_error)?
        .len()
        .try_into()
        .unwrap_or(i64::MAX);
    let status = state
        .complete_manual_sync(conflict_count)
        .map_err(command_error)?;
    emit_status(&app, &status);
    Ok(status)
}

#[command]
pub async fn sync_list_conflicts(
    state: State<'_, SyncState>,
) -> Result<Vec<SyncConflictSummary>, String> {
    list_open_conflicts_for_status(&state).map_err(command_error)
}

fn emit_status(app: &AppHandle, status: &SyncRuntimeStatus) {
    let _ = app.emit(
        SYNC_STATUS_EVENT,
        SyncStatusEvent {
            status: status.clone(),
        },
    );
}

fn status_with_conflicts(state: &SyncState) -> super::errors::SyncResult<SyncRuntimeStatus> {
    let mut status = state.status();
    let conflicts = list_open_conflicts(&status)?;
    status.conflict_count = conflicts.len().try_into().unwrap_or(i64::MAX);
    Ok(status)
}

fn list_open_conflicts_for_status(
    state: &SyncState,
) -> super::errors::SyncResult<Vec<SyncConflictSummary>> {
    let status = state.status();
    list_open_conflicts(&status)
}

fn list_open_conflicts(
    status: &SyncRuntimeStatus,
) -> super::errors::SyncResult<Vec<SyncConflictSummary>> {
    let Some(vault_id) = status.vault_id.as_deref() else {
        return Ok(Vec::new());
    };
    let Some(home) = dirs::home_dir() else {
        return Ok(Vec::new());
    };
    let path = db::sync_db_path(&home, vault_id)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let conn = db::open_sync_db(&path)?;
    db::list_open_conflicts(&conn).map(|conflicts| {
        conflicts
            .into_iter()
            .map(|conflict| SyncConflictSummary {
                conflict_id: conflict.conflict_id,
                path: conflict.path,
                conflict_path: conflict.conflict_path,
                base_commit_id: conflict.base_commit_id,
                remote_commit_id: conflict.remote_commit_id,
                status: conflict.status,
                created_at_ms: conflict.created_at_ms,
            })
            .collect()
    })
}

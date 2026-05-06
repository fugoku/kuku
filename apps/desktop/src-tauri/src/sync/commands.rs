use tauri::{AppHandle, Emitter, State, command};

use super::SyncState;
use super::errors::command_error;
use super::types::{SYNC_STATUS_EVENT, SyncRuntimeStatus, SyncStatusEvent, SyncVaultConfig};

#[command]
pub async fn sync_get_status(state: State<'_, SyncState>) -> Result<SyncRuntimeStatus, String> {
    Ok(state.status())
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

fn emit_status(app: &AppHandle, status: &SyncRuntimeStatus) {
    let _ = app.emit(
        SYNC_STATUS_EVENT,
        SyncStatusEvent {
            status: status.clone(),
        },
    );
}

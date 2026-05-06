pub type SyncResult<T> = Result<T, SyncError>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncError {
    InvalidArgument(String),
    NotConfigured,
}

impl std::fmt::Display for SyncError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SyncError::InvalidArgument(message) => write!(f, "invalid sync argument: {message}"),
            SyncError::NotConfigured => write!(f, "sync is not configured"),
        }
    }
}

impl std::error::Error for SyncError {}

pub fn command_error(error: SyncError) -> String {
    error.to_string()
}

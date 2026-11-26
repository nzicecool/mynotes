//! Offline, single-owner encrypted MyNotes vault. See the crate README for integration.
mod crypto;
mod model;
mod vault;

pub use model::{Note, NoteInput, RecoveryResult, VaultStatus};
pub use vault::Vault;

pub type Result<T> = std::result::Result<T, VaultError>;

/// Errors intentionally contain no SQL, filesystem paths, credentials, or note data.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum VaultError {
    #[error("The secure credential store is unavailable.")]
    SecureStore,
    #[error("The vault is locked.")]
    Locked,
    #[error("The vault has not been initialized.")]
    Uninitialized,
    #[error("The vault is already initialized.")]
    AlreadyInitialized,
    #[error("The PIN must contain at least six ASCII digits.")]
    InvalidPin,
    #[error("Authentication failed.")]
    Authentication,
    #[error("The input is invalid.")]
    InvalidInput,
    #[error("The note does not exist.")]
    NotFound,
    #[error("A vault size limit was exceeded.")]
    LimitExceeded,
    #[error("The data version is not supported.")]
    UnsupportedVersion,
    #[error("The vault data is corrupt.")]
    Corrupt,
    #[error("The storage operation failed.")]
    Storage,
    #[error("The backup operation failed.")]
    Backup,
}

/// Implement this using the OS credential manager, never a file or SQLite table.
/// Missing entries and every backend error MUST return `VaultError::SecureStore`.
/// IDs are fresh UUIDs for every enrollment; do not replace another ID's secret.
/// The parent must serialize all vault access and must not expose this trait to JS.
pub trait SecretStore: Send {
    fn get(&self, id: &str) -> Result<Vec<u8>>;
    fn set(&self, id: &str, secret: &[u8]) -> Result<()>;
    fn delete(&self, id: &str) -> Result<()>;
}

#[cfg(test)]
mod tests;

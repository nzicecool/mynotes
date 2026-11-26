use mynotes_vault::{Note, NoteInput, RecoveryResult, SecretStore, Vault, VaultError, VaultStatus};
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

struct OsSecretStore;
impl SecretStore for OsSecretStore {
    fn get(&self, id: &str) -> Result<Vec<u8>, VaultError> {
        keyring::Entry::new("io.senath.mynotes.desktop", id)
            .map_err(|_| VaultError::SecureStore)?
            .get_secret()
            .map_err(|_| VaultError::SecureStore)
    }
    fn set(&self, id: &str, secret: &[u8]) -> Result<(), VaultError> {
        let entry = keyring::Entry::new("io.senath.mynotes.desktop", id)
            .map_err(|_| VaultError::SecureStore)?;
        entry
            .set_secret(secret)
            .map_err(|_| VaultError::SecureStore)?;
        if entry.get_secret().map_err(|_| VaultError::SecureStore)? != secret {
            return Err(VaultError::SecureStore);
        }
        Ok(())
    }
    fn delete(&self, id: &str) -> Result<(), VaultError> {
        keyring::Entry::new("io.senath.mynotes.desktop", id)
            .map_err(|_| VaultError::SecureStore)?
            .delete_credential()
            .map_err(|_| VaultError::SecureStore)
    }
}

#[derive(Clone)]
struct DesktopState(Arc<Mutex<Vault>>);

async fn with_vault<T, F>(state: &DesktopState, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut Vault) -> Result<T, VaultError> + Send + 'static,
{
    let vault = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut vault = vault.lock().map_err(|_| {
            "Vault is temporarily unavailable. Restart MyNotes Desktop.".to_string()
        })?;
        f(&mut vault).map_err(|e| e.to_string())
    })
    .await
    .map_err(|_| "Vault operation could not complete.".to_string())?
}

#[tauri::command]
async fn vault_status(state: State<'_, DesktopState>) -> Result<VaultStatus, String> {
    with_vault(&state, |v| v.status()).await
}
#[tauri::command]
async fn setup_vault(
    state: State<'_, DesktopState>,
    pin: String,
) -> Result<RecoveryResult, String> {
    with_vault(&state, move |v| v.setup(&pin)).await
}
#[tauri::command]
async fn unlock_vault(state: State<'_, DesktopState>, pin: String) -> Result<(), String> {
    with_vault(&state, move |v| v.unlock(&pin)).await
}
#[tauri::command]
async fn lock_vault(state: State<'_, DesktopState>) -> Result<(), String> {
    with_vault(&state, |v| {
        v.lock();
        Ok(())
    })
    .await
}
#[tauri::command]
async fn recover_vault(
    state: State<'_, DesktopState>,
    code: String,
    new_pin: String,
) -> Result<RecoveryResult, String> {
    with_vault(&state, move |v| v.recover(&code, &new_pin)).await
}
#[tauri::command]
async fn change_pin(
    state: State<'_, DesktopState>,
    current_pin: String,
    new_pin: String,
) -> Result<(), String> {
    with_vault(&state, move |v| v.change_pin(&current_pin, &new_pin)).await
}
#[tauri::command]
async fn regenerate_codes(state: State<'_, DesktopState>) -> Result<RecoveryResult, String> {
    with_vault(&state, |v| v.regenerate_codes()).await
}
#[tauri::command]
async fn list_notes(state: State<'_, DesktopState>) -> Result<Vec<Note>, String> {
    with_vault(&state, |v| v.list_notes()).await
}
#[tauri::command]
async fn save_note(state: State<'_, DesktopState>, note: NoteInput) -> Result<Note, String> {
    with_vault(&state, move |v| v.save_note(note)).await
}
#[tauri::command]
async fn delete_note(state: State<'_, DesktopState>, id: String) -> Result<(), String> {
    with_vault(&state, move |v| v.delete_note(&id)).await
}
#[tauri::command]
async fn export_backup(state: State<'_, DesktopState>) -> Result<Option<String>, String> {
    // The renderer never supplies a path. The native save dialog is the authority.
    let selected = tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Export encrypted MyNotes backup")
            .add_filter("MyNotes encrypted backup", &["mynotes-backup"])
            .set_file_name("MyNotes.mynotes-backup")
            .save_file()
    })
    .await
    .map_err(|_| "Backup dialog could not open.".to_string())?;
    let Some(path) = selected else {
        return Ok(None);
    };
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "MyNotes backup".into());
    with_vault(&state, move |v| v.export_backup(&path)).await?;
    Ok(Some(name))
}
#[tauri::command]
async fn restore_backup(
    state: State<'_, DesktopState>,
    code: String,
    new_pin: String,
) -> Result<Option<RecoveryResult>, String> {
    let selected = tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Restore an encrypted MyNotes backup")
            .add_filter("MyNotes encrypted backup", &["mynotes-backup"])
            .pick_file()
    })
    .await
    .map_err(|_| "Restore dialog could not open.".to_string())?;
    let Some(path) = selected else {
        return Ok(None);
    };
    with_vault(&state, move |v| v.restore_backup(&path, &code, &new_pin))
        .await
        .map(Some)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700))?;
            }
            let vault =
                Vault::open(directory.join("vault.db"), Box::new(OsSecretStore)).map_err(|_| {
                    std::io::Error::other("Local vault could not open. No data was reset.")
                })?;
            app.manage(DesktopState(Arc::new(Mutex::new(vault))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault_status,
            setup_vault,
            unlock_vault,
            lock_vault,
            recover_vault,
            change_pin,
            regenerate_codes,
            list_notes,
            save_note,
            delete_note,
            export_backup,
            restore_backup,
        ])
        .build(tauri::generate_context!())
        .expect("MyNotes Desktop could not start. Existing vault files were not reset.")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                if let Some(state) = app.try_state::<DesktopState>() {
                    if let Ok(mut vault) = state.0.lock() {
                        vault.lock();
                    }
                }
            }
        });
}

use crate::crypto;
use crate::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::Connection;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tempfile::{tempdir, TempDir};

#[derive(Default)]
struct StoreState {
    entries: HashMap<String, Vec<u8>>,
    fail_get: bool,
    fail_set: bool,
    wrong_readback: bool,
}

#[derive(Clone, Default)]
struct MemoryStore(Arc<Mutex<StoreState>>);
impl SecretStore for MemoryStore {
    fn get(&self, id: &str) -> Result<Vec<u8>> {
        let state = self.0.lock().unwrap();
        if state.fail_get {
            return Err(VaultError::SecureStore);
        }
        if state.wrong_readback {
            return Ok(vec![99; 32]);
        }
        state
            .entries
            .get(id)
            .cloned()
            .ok_or(VaultError::SecureStore)
    }
    fn set(&self, id: &str, secret: &[u8]) -> Result<()> {
        let mut state = self.0.lock().unwrap();
        if state.fail_set {
            return Err(VaultError::SecureStore);
        }
        state.entries.insert(id.into(), secret.to_vec());
        Ok(())
    }
    fn delete(&self, id: &str) -> Result<()> {
        self.0.lock().unwrap().entries.remove(id);
        Ok(())
    }
}

fn fresh() -> (TempDir, PathBuf, MemoryStore, Vault) {
    let dir = tempdir().unwrap();
    let path = dir.path().join("vault.sqlite3");
    let store = MemoryStore::default();
    let vault = Vault::open(path.clone(), Box::new(store.clone())).unwrap();
    (dir, path, store, vault)
}

fn input(kind: &str) -> NoteInput {
    NoteInput {
        id: None,
        title: "PRIVATE_TITLE_xyz987".into(),
        content: "PRIVATE_CONTENT_xyz987".into(),
        note_type: kind.into(),
        tags: vec!["PRIVATE_TAG_xyz987".into()],
        pinned: true,
        archived: false,
        trashed: false,
    }
}

fn metadata(path: &std::path::Path) -> Value {
    let connection = Connection::open(path).unwrap();
    let text: String = connection
        .query_row("SELECT metadata FROM vault", [], |r| r.get(0))
        .unwrap();
    serde_json::from_str(&text).unwrap()
}

fn mutate_metadata(path: &std::path::Path, mutate: impl FnOnce(&mut Value)) {
    let connection = Connection::open(path).unwrap();
    let mut value = metadata(path);
    mutate(&mut value);
    connection
        .execute("UPDATE vault SET metadata=?1", [value.to_string()])
        .unwrap();
}

fn flip_ciphertext(value: &mut Value) {
    let ciphertext = value["ciphertext"].as_str().unwrap();
    let mut decoded = STANDARD.decode(ciphertext).unwrap();
    decoded[0] ^= 1;
    value["ciphertext"] = STANDARD.encode(decoded).into();
}

#[test]
fn setup_restart_locked_and_leading_zeros() {
    let (_dir, path, store, mut vault) = fresh();
    assert!(!vault.status().unwrap().initialized);
    let result = vault.setup("000007").unwrap();
    assert_eq!(result.codes.len(), 5);
    assert!(result.codes.iter().all(|c| c.len() == 71));
    assert_eq!(vault.status().unwrap().recovery_codes_remaining, 5);
    drop(vault);
    let mut vault = Vault::open(path, Box::new(store)).unwrap();
    assert!(!vault.status().unwrap().unlocked);
    assert_eq!(vault.unlock("7"), Err(VaultError::InvalidPin));
    vault.unlock("000007").unwrap();
    assert!(vault.list_notes().unwrap().is_empty());
}

#[test]
fn pin_validation() {
    let (_dir, _path, _store, mut vault) = fresh();
    for bad in ["12345", "12345a", "１２３４５６", " 123456", "123456\n"] {
        assert_eq!(vault.setup(bad), Err(VaultError::InvalidPin));
    }
    assert!(!vault.status().unwrap().initialized);
}

#[test]
fn wrong_pin_empty_vault_fails_closed() {
    let (_dir, _path, _store, mut vault) = fresh();
    vault.setup("123456").unwrap();
    assert_eq!(vault.unlock("654321"), Err(VaultError::Authentication));
    assert!(!vault.status().unwrap().unlocked);
    vault.unlock("123456").unwrap();
}

#[test]
fn missing_and_wrong_device_secret_fail_closed() {
    let (_dir, path, store, mut vault) = fresh();
    vault.setup("123456").unwrap();
    let id = metadata(&path)["credentialId"]
        .as_str()
        .unwrap()
        .to_string();
    let original = store.0.lock().unwrap().entries.remove(&id).unwrap();
    assert_eq!(vault.unlock("123456"), Err(VaultError::SecureStore));
    store
        .0
        .lock()
        .unwrap()
        .entries
        .insert(id.clone(), vec![0; 32]);
    assert_eq!(vault.unlock("123456"), Err(VaultError::Authentication));
    store
        .0
        .lock()
        .unwrap()
        .entries
        .insert(id.clone(), vec![0; 31]);
    assert_eq!(vault.unlock("123456"), Err(VaultError::SecureStore));
    store.0.lock().unwrap().entries.insert(id, original);
    vault.unlock("123456").unwrap();
}

#[test]
fn secure_store_failure_and_readback_do_not_initialize() {
    let (_dir, path, store, mut vault) = fresh();
    store.0.lock().unwrap().fail_set = true;
    assert_eq!(vault.setup("123456"), Err(VaultError::SecureStore));
    assert!(!path.exists());
    store.0.lock().unwrap().fail_set = false;
    store.0.lock().unwrap().fail_get = true;
    assert_eq!(vault.setup("123456"), Err(VaultError::SecureStore));
    assert!(!path.exists());
    store.0.lock().unwrap().fail_get = false;
    store.0.lock().unwrap().wrong_readback = true;
    assert_eq!(vault.setup("123456"), Err(VaultError::SecureStore));
    assert!(!path.exists());
    assert!(store.0.lock().unwrap().entries.is_empty());
}

#[test]
fn store_errors_during_unlock_lock_vault() {
    let (_dir, _path, store, mut vault) = fresh();
    vault.setup("123456").unwrap();
    store.0.lock().unwrap().fail_get = true;
    assert_eq!(vault.unlock("123456"), Err(VaultError::SecureStore));
    assert_eq!(vault.list_notes(), Err(VaultError::Locked));
}

#[test]
fn no_plaintext_metadata_in_database_wal_or_backup() {
    let (dir, path, store, mut vault) = fresh();
    let codes = vault.setup("001239").unwrap().codes;
    let note = vault.save_note(input("markdown")).unwrap();
    let backup = dir.path().join("portable.backup");
    vault.export_backup(&backup).unwrap();
    let markers = [
        note.title,
        note.content,
        note.tags[0].clone(),
        "createdAt".into(),
        "noteType".into(),
        "001239".into(),
        codes[0].clone(),
    ];
    for file in fs::read_dir(dir.path()).unwrap() {
        let bytes = fs::read(file.unwrap().path()).unwrap();
        for marker in &markers {
            assert!(
                !bytes
                    .windows(marker.len())
                    .any(|window| window == marker.as_bytes()),
                "plaintext leaked"
            );
        }
        for secret in store.0.lock().unwrap().entries.values() {
            assert!(!bytes.windows(secret.len()).any(|window| window == secret));
        }
    }
    assert!(path.exists());
    let json: Value = serde_json::from_slice(&fs::read(&backup).unwrap()).unwrap();
    assert!(json.to_string().find("credentialId").is_none());
    assert!(json.to_string().find("kdfVersion").is_none());
}

#[test]
fn six_types_save_update_delete_reopen() {
    let (_dir, path, store, mut vault) = fresh();
    vault.setup("123456").unwrap();
    for kind in [
        "plain",
        "rich",
        "markdown",
        "checklist",
        "code",
        "spreadsheet",
    ] {
        let original = vault.save_note(input(kind)).unwrap();
        let mut changed = input(kind);
        changed.id = Some(original.id.clone());
        changed.content = "updated".into();
        changed.archived = true;
        let updated = vault.save_note(changed).unwrap();
        assert_eq!(updated.created_at, original.created_at);
        assert!(updated.updated_at >= original.updated_at);
    }
    drop(vault);
    let mut vault = Vault::open(path, Box::new(store)).unwrap();
    vault.unlock("123456").unwrap();
    let notes = vault.list_notes().unwrap();
    assert_eq!(notes.len(), 6);
    assert!(notes.iter().all(|n| n.archived && n.content == "updated"));
    vault.delete_note(&notes[0].id).unwrap();
    assert_eq!(vault.list_notes().unwrap().len(), 5);
    assert_eq!(vault.delete_note(&notes[0].id), Err(VaultError::NotFound));
}

#[test]
fn locked_sensitive_apis() {
    let (dir, _path, _store, mut vault) = fresh();
    vault.setup("123456").unwrap();
    let note = vault.save_note(input("plain")).unwrap();
    let path = dir.path().join("backup");
    vault.export_backup(&path).unwrap();
    vault.lock();
    assert_eq!(vault.list_notes(), Err(VaultError::Locked));
    assert_eq!(vault.save_note(input("plain")), Err(VaultError::Locked));
    assert_eq!(vault.delete_note(&note.id), Err(VaultError::Locked));
    assert_eq!(vault.export_backup(&path), Err(VaultError::Locked));
    assert_eq!(vault.regenerate_codes(), Err(VaultError::Locked));
    assert_eq!(
        vault.change_pin("123456", "234567"),
        Err(VaultError::Locked)
    );
    assert_eq!(
        vault.restore_backup(&path, "invalid", "123456"),
        Err(VaultError::Locked)
    );
}

#[test]
fn tampered_empty_key_confirmation_fails() {
    let (_dir, path, _store, mut vault) = fresh();
    vault.setup("123456").unwrap();
    mutate_metadata(&path, |meta| flip_ciphertext(&mut meta["state"]));
    assert_eq!(vault.unlock("123456"), Err(VaultError::Authentication));
    assert!(!vault.status().unwrap().unlocked);
}

#[test]
fn tampered_note_and_deleted_row_fail_closed() {
    let (_dir, path, _store, mut vault) = fresh();
    vault.setup("123456").unwrap();
    let note = vault.save_note(input("plain")).unwrap();
    let connection = Connection::open(&path).unwrap();
    let original: String = connection
        .query_row("SELECT encrypted FROM notes", [], |r| r.get(0))
        .unwrap();
    let mut damaged: Value = serde_json::from_str(&original).unwrap();
    flip_ciphertext(&mut damaged);
    connection
        .execute("UPDATE notes SET encrypted=?1", [damaged.to_string()])
        .unwrap();
    assert_eq!(vault.list_notes(), Err(VaultError::Authentication));
    assert_eq!(vault.unlock("123456"), Err(VaultError::Authentication));
    connection
        .execute("UPDATE notes SET encrypted=?1", [original])
        .unwrap();
    vault.unlock("123456").unwrap();
    connection
        .execute("DELETE FROM notes WHERE id=?1", [&note.id])
        .unwrap();
    assert_eq!(vault.list_notes(), Err(VaultError::Corrupt));
}

#[test]
fn associated_data_prevents_record_swaps() {
    let (_dir, path, _store, mut vault) = fresh();
    vault.setup("123456").unwrap();
    let a = vault.save_note(input("plain")).unwrap();
    let b = vault.save_note(input("code")).unwrap();
    let connection = Connection::open(&path).unwrap();
    let encrypted: String = connection
        .query_row("SELECT encrypted FROM notes WHERE id=?1", [&a.id], |r| {
            r.get(0)
        })
        .unwrap();
    connection
        .execute(
            "UPDATE notes SET encrypted=?1 WHERE id=?2",
            rusqlite::params![encrypted, b.id],
        )
        .unwrap();
    assert_eq!(vault.list_notes(), Err(VaultError::Authentication));
}

#[test]
fn pin_change_preserves_note_ciphertext_and_codes() {
    let (_dir, path, _store, mut vault) = fresh();
    let codes = vault.setup("123456").unwrap().codes;
    vault.save_note(input("plain")).unwrap();
    let connection = Connection::open(&path).unwrap();
    let before: String = connection
        .query_row("SELECT encrypted FROM notes", [], |r| r.get(0))
        .unwrap();
    vault.change_pin("123456", "000008").unwrap();
    let after: String = connection
        .query_row("SELECT encrypted FROM notes", [], |r| r.get(0))
        .unwrap();
    assert_eq!(before, after);
    assert_eq!(vault.unlock("123456"), Err(VaultError::Authentication));
    vault.unlock("000008").unwrap();
    vault.recover(&codes[0], "000009").unwrap();
    assert_eq!(vault.list_notes().unwrap().len(), 1);
}

#[test]
fn failed_pin_change_preserves_previous_enrollment() {
    let (_dir, path, store, mut vault) = fresh();
    vault.setup("123456").unwrap();
    let old_metadata = metadata(&path);
    store.0.lock().unwrap().fail_set = true;
    assert_eq!(
        vault.change_pin("123456", "222222"),
        Err(VaultError::SecureStore)
    );
    assert_eq!(metadata(&path), old_metadata);
    store.0.lock().unwrap().fail_set = false;
    vault.unlock("123456").unwrap();
}

#[test]
fn recovery_rotates_all_codes_and_tolerates_case_spaces() {
    let (_dir, _path, store, mut vault) = fresh();
    let codes = vault.setup("123456").unwrap().codes;
    vault.save_note(input("plain")).unwrap();
    store.0.lock().unwrap().entries.clear();
    let tolerant = format!("  {} \n", codes[0].to_lowercase().replace('-', " "));
    let fresh = vault.recover(&tolerant, "000007").unwrap().codes;
    assert_eq!(fresh.len(), 5);
    assert_eq!(vault.list_notes().unwrap().len(), 1);
    for old in codes {
        assert_eq!(
            vault.recover(&old, "123456"),
            Err(VaultError::Authentication)
        );
    }
    vault.unlock("000007").unwrap();
    assert_eq!(vault.status().unwrap().recovery_codes_remaining, 5);
    vault.recover(&fresh[4], "000008").unwrap();
}

#[test]
fn regeneration_invalidates_current_old_codes() {
    let (_dir, _path, _store, mut vault) = fresh();
    let old = vault.setup("123456").unwrap().codes;
    let new = vault.regenerate_codes().unwrap().codes;
    for code in old {
        assert_eq!(
            vault.recover(&code, "123456"),
            Err(VaultError::Authentication)
        );
    }
    vault.recover(&new[2], "123456").unwrap();
}

#[test]
fn portable_backup_restores_on_clean_computer_and_old_copy_remains_usable() {
    let (dir, _path, _store, mut vault) = fresh();
    let old_codes = vault.setup("123456").unwrap().codes;
    let note = vault.save_note(input("rich")).unwrap();
    let backup = dir.path().join("export");
    vault.export_backup(&backup).unwrap();
    vault.regenerate_codes().unwrap();
    let (_clean_dir, _clean_path, clean_store, mut clean) = fresh();
    assert!(clean_store.0.lock().unwrap().entries.is_empty());
    let codes = clean
        .restore_backup(&backup, &old_codes[3], "000009")
        .unwrap()
        .codes;
    assert_eq!(clean.list_notes().unwrap(), vec![note.clone()]);
    clean.lock();
    clean.unlock("000009").unwrap();
    assert_eq!(
        clean.recover(&old_codes[3], "111111"),
        Err(VaultError::Authentication)
    );
    clean.recover(&codes[0], "000009").unwrap();
    let (_other_dir, _other_path, _other_store, mut other) = fresh();
    other
        .restore_backup(&backup, &old_codes[3], "222222")
        .unwrap();
    assert_eq!(other.list_notes().unwrap(), vec![note]);
}

#[test]
fn restore_tamper_wrong_code_and_store_failure_preserve_original() {
    let (source_dir, _source_path, _source_store, mut source) = fresh();
    let codes = source.setup("123456").unwrap().codes;
    source.save_note(input("markdown")).unwrap();
    let backup = source_dir.path().join("backup");
    source.export_backup(&backup).unwrap();
    let (_dir, path, store, mut target) = fresh();
    target.setup("999999").unwrap();
    let original = target.save_note(input("code")).unwrap();
    let old_metadata = metadata(&path);
    assert_eq!(
        target.restore_backup(&backup, &"AB".repeat(32), "111111"),
        Err(VaultError::Authentication)
    );
    assert_eq!(target.list_notes().unwrap(), vec![original.clone()]);
    let mut damaged: Value = serde_json::from_slice(&fs::read(&backup).unwrap()).unwrap();
    flip_ciphertext(&mut damaged["payload"]);
    let corrupt = source_dir.path().join("corrupt");
    fs::write(&corrupt, damaged.to_string()).unwrap();
    assert_eq!(
        target.restore_backup(&corrupt, &codes[0], "111111"),
        Err(VaultError::Authentication)
    );
    assert_eq!(metadata(&path), old_metadata);
    store.0.lock().unwrap().fail_set = true;
    assert_eq!(
        target.restore_backup(&backup, &codes[0], "111111"),
        Err(VaultError::SecureStore)
    );
    assert_eq!(metadata(&path), old_metadata);
    store.0.lock().unwrap().fail_set = false;
    target.unlock("999999").unwrap();
    assert_eq!(target.list_notes().unwrap(), vec![original]);
}

#[test]
fn replacement_retains_verified_encrypted_rollback_and_device_key() {
    let (source_dir, _source_path, _source_store, mut source) = fresh();
    let codes = source.setup("123456").unwrap().codes;
    let replacement = source.save_note(input("rich")).unwrap();
    let backup = source_dir.path().join("backup");
    source.export_backup(&backup).unwrap();
    let (_dir, path, store, mut target) = fresh();
    target.setup("999999").unwrap();
    target.save_note(input("code")).unwrap();
    let old_metadata = metadata(&path);
    let old_id = old_metadata["credentialId"].as_str().unwrap().to_string();
    target.restore_backup(&backup, &codes[0], "111111").unwrap();
    assert_eq!(target.list_notes().unwrap(), vec![replacement]);
    assert!(store.get(&old_id).is_ok());
    let connection = Connection::open(&path).unwrap();
    let (retained_meta, retained_backup): (String, Vec<u8>) = connection
        .query_row(
            "SELECT previous_metadata,encrypted_backup FROM rollback",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(&retained_meta).unwrap(),
        old_metadata
    );
    let backup: Value = serde_json::from_slice(&retained_backup).unwrap();
    assert_eq!(backup["header"]["vaultId"], old_metadata["vaultId"]);
    let secret = store.get(&old_id).unwrap();
    let salt = STANDARD
        .decode(old_metadata["salt"].as_str().unwrap())
        .unwrap();
    let pin_key = crypto::pin_key("999999", &secret, &salt).unwrap();
    let wrapper = serde_json::from_value(old_metadata["pin"].clone()).unwrap();
    let vault_key = crypto::unseal(
        pin_key.as_ref(),
        &wrapper,
        &crypto::pin_aad(old_metadata["vaultId"].as_str().unwrap(), &old_id),
        32,
    )
    .unwrap();
    let payload = serde_json::from_value(backup["payload"].clone()).unwrap();
    // Rebuild the typed canonical field ordering used for backup AAD.
    let wrappers: Vec<crate::crypto::Sealed> =
        serde_json::from_value(backup["header"]["recovery"].clone()).unwrap();
    let aad_typed = format!(
        "{{\"format\":{},\"version\":{},\"vaultId\":{},\"recovery\":{}}}",
        backup["header"]["format"],
        backup["header"]["version"],
        backup["header"]["vaultId"],
        serde_json::to_string(&wrappers).unwrap()
    );
    let plaintext =
        crypto::unseal(&vault_key, &payload, aad_typed.as_bytes(), 64 * 1024 * 1024).unwrap();
    let snapshot: Value = serde_json::from_slice(&plaintext).unwrap();
    assert_eq!(snapshot["records"].as_array().unwrap().len(), 1);
    let record = &snapshot["records"][0];
    let sealed = serde_json::from_value(record["sealed"].clone()).unwrap();
    let bytes = crypto::unseal(
        &vault_key,
        &sealed,
        &crypto::record_aad(
            old_metadata["vaultId"].as_str().unwrap(),
            record["id"].as_str().unwrap(),
        ),
        2 * 1024 * 1024,
    )
    .unwrap();
    let original: Note = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(original.note_type, "code");
}

#[test]
fn unknown_versions_corrupt_existing_and_plaintext_fallback_rejected() {
    let (_dir, path, store, mut vault) = fresh();
    fs::write(&path, b"").unwrap();
    assert!(matches!(
        Vault::open(path.clone(), Box::new(store.clone())),
        Err(VaultError::Corrupt)
    ));
    fs::remove_file(&path).unwrap();
    vault.setup("123456").unwrap();
    mutate_metadata(&path, |meta| meta["version"] = 2.into());
    assert_eq!(vault.status(), Err(VaultError::UnsupportedVersion));
    assert!(matches!(
        Vault::open(path.clone(), Box::new(store)),
        Err(VaultError::UnsupportedVersion)
    ));
}

#[test]
fn note_size_type_id_and_dto_validation() {
    let (_dir, _path, _store, mut vault) = fresh();
    vault.setup("123456").unwrap();
    assert_eq!(
        vault.save_note(input("future")),
        Err(VaultError::InvalidInput)
    );
    let mut bad = input("plain");
    bad.content = "x".repeat(2 * 1024 * 1024);
    assert_eq!(vault.save_note(bad), Err(VaultError::LimitExceeded));
    let mut bad = input("plain");
    bad.id = Some("not-a-uuid".into());
    assert_eq!(vault.save_note(bad), Err(VaultError::InvalidInput));
    let json = serde_json::to_value(input("plain")).unwrap();
    assert!(json.get("noteType").is_some());
    assert!(json.get("createdAt").is_none());
    assert!(serde_json::from_value::<NoteInput>({
        let mut v = json;
        v["unknown"] = true.into();
        v
    })
    .is_err());
}

#[test]
fn backup_size_version_and_header_tamper_validation() {
    let (dir, _path, _store, mut vault) = fresh();
    let codes = vault.setup("123456").unwrap().codes;
    let backup = dir.path().join("backup");
    vault.export_backup(&backup).unwrap();
    let (_target_dir, _target_path, _target_store, mut target) = fresh();
    let oversized = dir.path().join("oversized");
    let f = fs::File::create(&oversized).unwrap();
    f.set_len(64 * 1024 * 1024 + 1).unwrap();
    assert_eq!(
        target.restore_backup(&oversized, &codes[0], "123456"),
        Err(VaultError::LimitExceeded)
    );
    let mut data: Value = serde_json::from_slice(&fs::read(&backup).unwrap()).unwrap();
    data["header"]["version"] = 2.into();
    let bad = dir.path().join("bad");
    fs::write(&bad, data.to_string()).unwrap();
    assert_eq!(
        target.restore_backup(&bad, &codes[0], "123456"),
        Err(VaultError::UnsupportedVersion)
    );
    data["header"]["version"] = 1.into();
    data["header"]["recovery"]
        .as_array_mut()
        .unwrap()
        .swap(0, 1);
    fs::write(&bad, data.to_string()).unwrap();
    assert_eq!(
        target.restore_backup(&bad, &codes[0], "123456"),
        Err(VaultError::Authentication)
    );
    assert!(!target.status().unwrap().initialized);
}

#[test]
fn export_cannot_replace_live_database_or_sidecars() {
    let (_dir, path, _store, mut vault) = fresh();
    vault.setup("123456").unwrap();
    assert_eq!(vault.export_backup(&path), Err(VaultError::Backup));
    let mut wal = path.as_os_str().to_os_string();
    wal.push("-wal");
    assert_eq!(
        vault.export_backup(PathBuf::from(wal)),
        Err(VaultError::Backup)
    );
    assert!(vault.status().unwrap().initialized);
}

#[test]
fn database_transaction_failure_preserves_old_enrollment() {
    let (_dir, path, store, mut vault) = fresh();
    vault.setup("123456").unwrap();
    let previous = metadata(&path);
    let connection = Connection::open(&path).unwrap();
    connection.execute_batch("CREATE TRIGGER deny_update BEFORE UPDATE ON vault BEGIN SELECT RAISE(ABORT,'private SQL error'); END;").unwrap();
    assert_eq!(
        vault.change_pin("123456", "222222"),
        Err(VaultError::Storage)
    );
    assert_eq!(metadata(&path), previous);
    assert_eq!(store.0.lock().unwrap().entries.len(), 1);
    connection
        .execute_batch("DROP TRIGGER deny_update;")
        .unwrap();
    vault.unlock("123456").unwrap();
}

#[test]
fn errors_are_sanitized() {
    for error in [
        VaultError::SecureStore,
        VaultError::Authentication,
        VaultError::Storage,
        VaultError::Corrupt,
        VaultError::Backup,
    ] {
        let text = error.to_string();
        assert!(!text.contains("SELECT"));
        assert!(!text.contains("/home"));
        assert!(!text.contains("123456"));
    }
}

#[test]
fn raced_existing_file_is_never_deleted_by_setup() {
    let (_dir, path, _store, mut vault) = fresh();
    fs::write(&path, b"original unrelated data").unwrap();
    assert_eq!(vault.setup("123456"), Err(VaultError::Storage));
    assert_eq!(fs::read(&path).unwrap(), b"original unrelated data");
}

#[test]
fn missing_metadata_and_unknown_tables_never_become_uninitialized() {
    let (_dir, path, store, mut vault) = fresh();
    vault.setup("123456").unwrap();
    let connection = Connection::open(&path).unwrap();
    connection
        .execute_batch("CREATE TABLE unknown(secret TEXT);")
        .unwrap();
    assert!(matches!(
        Vault::open(path.clone(), Box::new(store.clone())),
        Err(VaultError::Corrupt)
    ));
    connection
        .execute_batch("DROP TABLE unknown; DELETE FROM vault;")
        .unwrap();
    assert_eq!(vault.status(), Err(VaultError::Corrupt));
    assert!(matches!(
        Vault::open(path, Box::new(store)),
        Err(VaultError::Corrupt)
    ));
}

#[test]
fn plaintext_note_json_is_rejected_without_fallback() {
    let (_dir, path, _store, mut vault) = fresh();
    vault.setup("123456").unwrap();
    let note = vault.save_note(input("plain")).unwrap();
    let connection = Connection::open(&path).unwrap();
    connection
        .execute(
            "UPDATE notes SET encrypted=?1",
            [serde_json::to_string(&note).unwrap()],
        )
        .unwrap();
    assert_eq!(vault.list_notes(), Err(VaultError::Corrupt));
    assert_eq!(vault.unlock("123456"), Err(VaultError::Corrupt));
    assert!(!vault.status().unwrap().unlocked);
}

#[test]
fn restore_sql_failure_rolls_back_snapshot_and_keeps_enrollment() {
    let (source_dir, _source_path, _source_store, mut source) = fresh();
    let codes = source.setup("123456").unwrap().codes;
    source.save_note(input("rich")).unwrap();
    let backup = source_dir.path().join("backup");
    source.export_backup(&backup).unwrap();
    let (_dir, path, store, mut target) = fresh();
    target.setup("999999").unwrap();
    let original = target.save_note(input("code")).unwrap();
    let before = metadata(&path);
    let connection = Connection::open(&path).unwrap();
    connection.execute_batch("CREATE TRIGGER deny_restore BEFORE UPDATE ON vault BEGIN SELECT RAISE(ABORT,'sensitive SQL'); END;").unwrap();
    assert_eq!(
        target.restore_backup(&backup, &codes[0], "111111"),
        Err(VaultError::Storage)
    );
    assert_eq!(metadata(&path), before);
    assert_eq!(target.list_notes().unwrap(), vec![original]);
    let count: i64 = connection
        .query_row("SELECT count(*) FROM rollback", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 0);
    assert_eq!(store.0.lock().unwrap().entries.len(), 1);
    connection
        .execute_batch("DROP TRIGGER deny_restore;")
        .unwrap();
    target.unlock("999999").unwrap();
}

// Reconstruct the exact typed AAD, not serde_json::Value's sorted object ordering.
fn header_aad(header: &Value) -> Vec<u8> {
    let wrappers: Vec<crate::crypto::Sealed> =
        serde_json::from_value(header["recovery"].clone()).unwrap();
    format!(
        "{{\"format\":{},\"version\":{},\"vaultId\":{},\"recovery\":{}}}",
        header["format"],
        header["version"],
        header["vaultId"],
        serde_json::to_string(&wrappers).unwrap()
    )
    .into_bytes()
}

#[test]
fn authenticated_snapshot_versions_counts_types_and_duplicate_ids_checked_before_writes() {
    let (dir, path, store, mut vault) = fresh();
    let codes = vault.setup("123456").unwrap().codes;
    let note = vault.save_note(input("plain")).unwrap();
    let backup_path = dir.path().join("backup");
    vault.export_backup(&backup_path).unwrap();
    let meta = metadata(&path);
    let id = meta["credentialId"].as_str().unwrap();
    let secret = store.get(id).unwrap();
    let salt = STANDARD.decode(meta["salt"].as_str().unwrap()).unwrap();
    let derived = crypto::pin_key("123456", &secret, &salt).unwrap();
    let wrapper = serde_json::from_value(meta["pin"].clone()).unwrap();
    let key = crypto::unseal(
        derived.as_ref(),
        &wrapper,
        &crypto::pin_aad(meta["vaultId"].as_str().unwrap(), id),
        32,
    )
    .unwrap();
    let original: Value = serde_json::from_slice(&fs::read(&backup_path).unwrap()).unwrap();
    let aad = header_aad(&original["header"]);
    let payload = serde_json::from_value(original["payload"].clone()).unwrap();
    let bytes = crypto::unseal(&key, &payload, &aad, 64 * 1024 * 1024).unwrap();
    let snapshot: Value = serde_json::from_slice(&bytes).unwrap();
    let (_target_dir, target_path, target_store, mut target) = fresh();
    let mut cases = Vec::new();
    let mut version = snapshot.clone();
    version["version"] = 99.into();
    cases.push((version, VaultError::UnsupportedVersion));
    let mut duplicate = snapshot.clone();
    duplicate["records"]
        .as_array_mut()
        .unwrap()
        .push(snapshot["records"][0].clone());
    cases.push((duplicate, VaultError::Corrupt));
    let mut excessive = snapshot.clone();
    excessive["records"] = Value::Array(vec![snapshot["records"][0].clone(); 10_001]);
    cases.push((excessive, VaultError::LimitExceeded));
    let mut bad_type = snapshot.clone();
    let mut invalid_note = serde_json::to_value(&note).unwrap();
    invalid_note["noteType"] = "unsupported".into();
    let invalid_sealed = crypto::seal(
        &key,
        &serde_json::to_vec(&invalid_note).unwrap(),
        &crypto::record_aad(meta["vaultId"].as_str().unwrap(), &note.id),
    )
    .unwrap();
    bad_type["records"][0]["sealed"] = serde_json::to_value(invalid_sealed).unwrap();
    cases.push((bad_type, VaultError::Corrupt));
    let mut bad_envelope = snapshot;
    bad_envelope["records"][0]["sealed"]["version"] = 99.into();
    cases.push((bad_envelope, VaultError::UnsupportedVersion));
    for (snapshot, expected) in cases {
        let mut forged = original.clone();
        forged["payload"] = serde_json::to_value(
            crypto::seal(&key, &serde_json::to_vec(&snapshot).unwrap(), &aad).unwrap(),
        )
        .unwrap();
        let file = dir.path().join("forged");
        fs::write(&file, forged.to_string()).unwrap();
        assert_eq!(
            target.restore_backup(&file, &codes[0], "111111"),
            Err(expected)
        );
        assert!(!target_path.exists());
        assert!(target_store.0.lock().unwrap().entries.is_empty());
    }
}

#[test]
fn export_size_limit_never_creates_an_unrestorable_file() {
    let (dir, _path, _store, mut vault) = fresh();
    vault.setup("123456").unwrap();
    for _ in 0..19 {
        let mut note = input("plain");
        note.content = "x".repeat(2 * 1024 * 1024 - 2048);
        vault.save_note(note).unwrap();
    }
    let backup = dir.path().join("too-large");
    assert_eq!(vault.export_backup(&backup), Err(VaultError::LimitExceeded));
    assert!(!backup.exists());
    assert_eq!(vault.list_notes().unwrap().len(), 19);
    assert!(fs::read_dir(dir.path()).unwrap().all(|entry| !entry
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with(".tmp")));
}

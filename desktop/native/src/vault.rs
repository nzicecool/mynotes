use crate::crypto::{self, Key, Sealed, CODE_COUNT, KDF_VERSION, VERSION};
use crate::model::{self, MAX_BACKUP_BYTES, MAX_NOTES, MAX_NOTE_BYTES};
use crate::{Note, NoteInput, RecoveryResult, Result, SecretStore, VaultError, VaultStatus};
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection, OpenFlags, Transaction};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tempfile::NamedTempFile;
use uuid::Uuid;
use zeroize::Zeroizing;

const FORMAT: &str = "mynotes-portable-vault";
const MAX_STATE_BYTES: usize = 512 * 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Metadata {
    version: u32,
    kdf_version: u32,
    vault_id: String,
    credential_id: String,
    salt: String,
    pin: Sealed,
    recovery: Vec<Sealed>,
    state: Sealed,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct State {
    marker: String,
    ids: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    id: String,
    sealed: Sealed,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Snapshot {
    version: u32,
    vault_id: String,
    #[serde(deserialize_with = "bounded_records")]
    records: Vec<Record>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SnapshotPreflight<'a> {
    version: u32,
    vault_id: &'a str,
    #[serde(borrow)]
    records: &'a serde_json::value::RawValue,
}

fn bounded_records<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Vec<Record>, D::Error> {
    struct RecordsVisitor;
    impl<'de> serde::de::Visitor<'de> for RecordsVisitor {
        type Value = Vec<Record>;
        fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            f.write_str("a bounded record sequence")
        }
        fn visit_seq<A: serde::de::SeqAccess<'de>>(
            self,
            mut sequence: A,
        ) -> std::result::Result<Self::Value, A::Error> {
            let mut records = Vec::new();
            while let Some(record) = sequence.next_element::<Record>()? {
                if records.len() >= MAX_NOTES {
                    return Err(serde::de::Error::custom("vault-limit"));
                }
                if record.sealed.version != VERSION {
                    return Err(serde::de::Error::custom("vault-version"));
                }
                if !model::valid_id(&record.id)
                    || check_sealed(&record.sealed, MAX_NOTE_BYTES).is_err()
                {
                    return Err(serde::de::Error::custom("vault-record"));
                }
                records.push(record);
            }
            Ok(records)
        }
    }
    deserializer.deserialize_seq(RecordsVisitor)
}

/// The outer PIN-less header is public; its exact wrappers are authenticated by payload AAD.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BackupHeader {
    format: String,
    version: u32,
    vault_id: String,
    recovery: Vec<Sealed>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Backup {
    header: BackupHeader,
    payload: Sealed,
}

/// Own one Vault per database, serialized by a native Mutex. Never share the DB with
/// another writer or derive Debug for this object. Dropping or locking zeroizes its key.
pub struct Vault {
    path: PathBuf,
    store: Box<dyn SecretStore + Send>,
    connection: Option<Connection>,
    key: Option<Key>,
}

fn sql<T>(value: rusqlite::Result<T>) -> Result<T> {
    value.map_err(|_| VaultError::Storage)
}

fn encode<T: Serialize>(value: &T) -> Result<String> {
    serde_json::to_string(value).map_err(|_| VaultError::Corrupt)
}

fn decode<T: for<'de> Deserialize<'de>>(value: &str) -> Result<T> {
    serde_json::from_str(value).map_err(|_| VaultError::Corrupt)
}

fn check_sealed(value: &Sealed, max: usize) -> Result<()> {
    if value.version != VERSION {
        return Err(VaultError::UnsupportedVersion);
    }
    if value.nonce.len() != 16 || value.ciphertext.len() > (max + 16).div_ceil(3) * 4 {
        return Err(VaultError::Corrupt);
    }
    let nonce = STANDARD
        .decode(&value.nonce)
        .map_err(|_| VaultError::Corrupt)?;
    let ciphertext = STANDARD
        .decode(&value.ciphertext)
        .map_err(|_| VaultError::Corrupt)?;
    if nonce.len() != 12 || !(16..=max + 16).contains(&ciphertext.len()) {
        return Err(VaultError::Corrupt);
    }
    Ok(())
}

fn validate_metadata(meta: &Metadata) -> Result<()> {
    if meta.version != VERSION || meta.kdf_version != KDF_VERSION {
        return Err(VaultError::UnsupportedVersion);
    }
    if !model::valid_id(&meta.vault_id)
        || !model::valid_id(&meta.credential_id)
        || meta.recovery.len() != CODE_COUNT
        || meta.salt.len() != 24
        || STANDARD
            .decode(&meta.salt)
            .map_err(|_| VaultError::Corrupt)?
            .len()
            != 16
    {
        return Err(VaultError::Corrupt);
    }
    check_sealed(&meta.pin, 32)?;
    check_sealed(&meta.state, MAX_STATE_BYTES)?;
    for wrapper in &meta.recovery {
        check_sealed(wrapper, 32)?;
    }
    Ok(())
}

fn state_aad(vault_id: &str) -> Vec<u8> {
    format!("mynotes:state:v1:{vault_id}").into_bytes()
}

fn make_state(vault_id: &str, key: &[u8], records: &[Record]) -> Result<Sealed> {
    let mut ids: Vec<_> = records.iter().map(|r| r.id.clone()).collect();
    ids.sort();
    let bytes = Zeroizing::new(
        serde_json::to_vec(&State {
            marker: "mynotes-key-confirmation-v1".into(),
            ids,
        })
        .map_err(|_| VaultError::Corrupt)?,
    );
    crypto::seal(key, &bytes, &state_aad(vault_id))
}

fn validate_records(vault_id: &str, key: &[u8], records: &[Record]) -> Result<Vec<Note>> {
    if records.len() > MAX_NOTES {
        return Err(VaultError::LimitExceeded);
    }
    let mut seen = HashSet::new();
    let mut notes = Vec::with_capacity(records.len());
    for record in records {
        if !model::valid_id(&record.id) || !seen.insert(&record.id) {
            return Err(VaultError::Corrupt);
        }
        let bytes = crypto::unseal(
            key,
            &record.sealed,
            &crypto::record_aad(vault_id, &record.id),
            MAX_NOTE_BYTES,
        )?;
        let note: Note = serde_json::from_slice(&bytes).map_err(|_| VaultError::Corrupt)?;
        note.validate().map_err(|error| match error {
            VaultError::LimitExceeded => error,
            _ => VaultError::Corrupt,
        })?;
        if note.id != record.id {
            return Err(VaultError::Corrupt);
        }
        notes.push(note);
    }
    Ok(notes)
}

fn validate_state(meta: &Metadata, key: &[u8], records: &[Record]) -> Result<()> {
    let bytes = crypto::unseal(
        key,
        &meta.state,
        &state_aad(&meta.vault_id),
        MAX_STATE_BYTES,
    )?;
    let state: State = serde_json::from_slice(&bytes).map_err(|_| VaultError::Corrupt)?;
    let mut ids: Vec<_> = records.iter().map(|r| r.id.clone()).collect();
    ids.sort();
    if state.marker != "mynotes-key-confirmation-v1" || state.ids != ids {
        return Err(VaultError::Corrupt);
    }
    Ok(())
}

fn read_metadata(connection: &Connection) -> Result<Metadata> {
    let count: i64 = sql(connection.query_row("SELECT count(*) FROM vault", [], |row| row.get(0)))?;
    if count != 1 {
        return Err(VaultError::Corrupt);
    }
    let length: i64 = sql(connection.query_row(
        "SELECT length(CAST(metadata AS BLOB)) FROM vault WHERE singleton=1",
        [],
        |row| row.get(0),
    ))?;
    if !(1..=1024 * 1024).contains(&length) {
        return Err(VaultError::Corrupt);
    }
    let text: String = sql(connection.query_row(
        "SELECT metadata FROM vault WHERE singleton=1",
        [],
        |row| row.get(0),
    ))?;
    if text.len() > 1024 * 1024 {
        return Err(VaultError::Corrupt);
    }
    let meta: Metadata = decode(&text)?;
    validate_metadata(&meta)?;
    Ok(meta)
}

fn read_records(connection: &Connection) -> Result<Vec<Record>> {
    let count: i64 = sql(connection.query_row("SELECT count(*) FROM notes", [], |row| row.get(0)))?;
    if !(0..=MAX_NOTES as i64).contains(&count) {
        return Err(VaultError::LimitExceeded);
    }
    let max_record = (MAX_NOTE_BYTES + 16).div_ceil(3) * 4 + 256;
    let oversized: bool = sql(connection.query_row("SELECT EXISTS(SELECT 1 FROM notes WHERE length(CAST(encrypted AS BLOB)) > ?1 OR length(CAST(id AS BLOB)) != 36)", [max_record as i64], |row| row.get(0)))?;
    if oversized {
        return Err(VaultError::Corrupt);
    }
    let mut statement = sql(connection.prepare("SELECT id, encrypted FROM notes ORDER BY id"))?;
    let rows = sql(statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }))?;
    let mut records = Vec::with_capacity(count as usize);
    for row in rows {
        let (id, text) = sql(row)?;
        if text.len() > (MAX_NOTE_BYTES + 16).div_ceil(3) * 4 + 256 {
            return Err(VaultError::Corrupt);
        }
        let sealed: Sealed = decode(&text)?;
        check_sealed(&sealed, MAX_NOTE_BYTES)?;
        records.push(Record { id, sealed });
    }
    Ok(records)
}

fn read_backup_records(connection: &Connection) -> Result<Vec<Record>> {
    let total: i64 = sql(connection.query_row(
        "SELECT coalesce(sum(length(CAST(encrypted AS BLOB))),0) FROM notes",
        [],
        |row| row.get(0),
    ))?;
    if total < 0 || total as u64 > MAX_BACKUP_BYTES / 4 * 3 {
        return Err(VaultError::LimitExceeded);
    }
    read_records(connection)
}

fn validate_schema(connection: &Connection) -> Result<()> {
    let mut statement = connection
        .prepare("SELECT type,name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name")
        .map_err(|_| VaultError::Corrupt)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|_| VaultError::Corrupt)?;
    let actual: Vec<_> = rows
        .collect::<rusqlite::Result<_>>()
        .map_err(|_| VaultError::Corrupt)?;
    let expected = vec![
        ("table".into(), "notes".into()),
        ("table".into(), "rollback".into()),
        ("table".into(), "vault".into()),
    ];
    if actual != expected {
        return Err(VaultError::Corrupt);
    }
    Ok(())
}

fn configure(connection: &Connection) -> Result<()> {
    sql(connection.busy_timeout(std::time::Duration::from_secs(5)))?;
    sql(connection.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF;"))?;
    Ok(())
}

fn private_file(file: &File) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(fs::Permissions::from_mode(0o600))
            .map_err(|_| VaultError::Storage)?;
    }
    #[cfg(not(unix))]
    {
        let _ = file;
    }
    Ok(())
}

fn persist_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let mut file = NamedTempFile::new_in(parent).map_err(|_| VaultError::Backup)?;
    private_file(file.as_file()).map_err(|_| VaultError::Backup)?;
    file.write_all(bytes).map_err(|_| VaultError::Backup)?;
    file.as_file().sync_all().map_err(|_| VaultError::Backup)?;
    file.persist(path).map_err(|_| VaultError::Backup)?;
    // Syncing a directory is available on Unix; Windows cannot open directories this way.
    #[cfg(unix)]
    File::open(parent)
        .and_then(|f| f.sync_all())
        .map_err(|_| VaultError::Backup)?;
    Ok(())
}

fn make_backup(meta: &Metadata, key: &[u8], records: Vec<Record>) -> Result<Vec<u8>> {
    let header = BackupHeader {
        format: FORMAT.into(),
        version: VERSION,
        vault_id: meta.vault_id.clone(),
        recovery: meta.recovery.clone(),
    };
    let aad = serde_json::to_vec(&header).map_err(|_| VaultError::Backup)?;
    // Cap during serialization, not after potentially allocating a multi-GiB snapshot.
    // Reserve room for the outer JSON/header, GCM tag and base64 expansion.
    struct CappedBuffer {
        bytes: Zeroizing<Vec<u8>>,
        limit: usize,
    }
    impl Write for CappedBuffer {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            if bytes.len() > self.limit.saturating_sub(self.bytes.len()) {
                return Err(std::io::Error::other("vault-limit"));
            }
            self.bytes.extend_from_slice(bytes);
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let limit = (MAX_BACKUP_BYTES as usize - aad.len() - 256) / 4 * 3 - 16;
    let mut buffer = CappedBuffer {
        bytes: Zeroizing::new(Vec::new()),
        limit,
    };
    serde_json::to_writer(
        &mut buffer,
        &Snapshot {
            version: VERSION,
            vault_id: meta.vault_id.clone(),
            records,
        },
    )
    .map_err(|_| VaultError::LimitExceeded)?;
    let payload = buffer.bytes;
    let sealed = crypto::seal(key, &payload, &aad)?;
    let bytes = serde_json::to_vec(&Backup {
        header,
        payload: sealed,
    })
    .map_err(|_| VaultError::Backup)?;
    if bytes.len() as u64 > MAX_BACKUP_BYTES {
        return Err(VaultError::LimitExceeded);
    }
    Ok(bytes)
}

impl Vault {
    pub fn open(path: PathBuf, store: Box<dyn SecretStore + Send>) -> Result<Self> {
        let connection = match fs::symlink_metadata(&path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(_) => return Err(VaultError::Storage),
            Ok(info) => {
                if !info.file_type().is_file() || info.len() == 0 {
                    return Err(VaultError::Corrupt);
                }
                let connection =
                    Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_WRITE)
                        .map_err(|_| VaultError::Corrupt)?;
                let version: i64 = connection
                    .query_row("PRAGMA user_version", [], |row| row.get(0))
                    .map_err(|_| VaultError::Corrupt)?;
                if version != i64::from(VERSION) {
                    if version == 0 {
                        return Err(VaultError::Corrupt);
                    }
                    return Err(VaultError::UnsupportedVersion);
                }
                validate_schema(&connection)?;
                let check: String = connection
                    .query_row("PRAGMA quick_check", [], |row| row.get(0))
                    .map_err(|_| VaultError::Corrupt)?;
                if check != "ok" {
                    return Err(VaultError::Corrupt);
                }
                read_metadata(&connection).map_err(|e| {
                    if e == VaultError::Storage {
                        VaultError::Corrupt
                    } else {
                        e
                    }
                })?;
                read_records(&connection).map_err(|e| {
                    if e == VaultError::Storage {
                        VaultError::Corrupt
                    } else {
                        e
                    }
                })?;
                configure(&connection)?;
                Some(connection)
            }
        };
        Ok(Self {
            path,
            store,
            connection,
            key: None,
        })
    }

    pub fn status(&self) -> Result<VaultStatus> {
        match &self.connection {
            None => Ok(VaultStatus {
                initialized: false,
                unlocked: false,
                recovery_codes_remaining: 0,
            }),
            Some(connection) => {
                let meta = read_metadata(connection)?;
                Ok(VaultStatus {
                    initialized: true,
                    unlocked: self.key.is_some(),
                    recovery_codes_remaining: meta.recovery.len(),
                })
            }
        }
    }

    fn connection(&self) -> Result<&Connection> {
        self.connection.as_ref().ok_or(VaultError::Uninitialized)
    }

    fn unlocked(&self) -> Result<&[u8]> {
        self.key
            .as_ref()
            .map(|key| &key[..])
            .ok_or(VaultError::Locked)
    }

    fn enrollment(
        &self,
        vault_id: &str,
        pin: &str,
        key: &[u8],
    ) -> Result<(String, String, Sealed)> {
        model::validate_pin(pin)?;
        let id = Uuid::new_v4().to_string();
        let secret = Zeroizing::new(crypto::random::<32>()?);
        let salt = crypto::random::<16>()?;
        let derived = crypto::pin_key(pin, secret.as_ref(), &salt)?;
        let wrapper = crypto::seal(derived.as_ref(), key, &crypto::pin_aad(vault_id, &id))?;
        // Verify the actual persisted secret before a DB transaction can reference it.
        if self.store.set(&id, secret.as_ref()).is_err() {
            let _ = self.store.delete(&id);
            return Err(VaultError::SecureStore);
        }
        match self.store.get(&id).map(Zeroizing::new) {
            Ok(readback) if readback.as_slice() == secret.as_ref() => (),
            _ => {
                let _ = self.store.delete(&id);
                return Err(VaultError::SecureStore);
            }
        }
        Ok((id, STANDARD.encode(salt), wrapper))
    }

    fn create_connection(&self, created: &mut bool) -> Result<Connection> {
        // create_new prohibits overwriting a file which appeared since open().
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = options.open(&self.path).map_err(|_| VaultError::Storage)?;
        *created = true;
        private_file(&file)?;
        drop(file);
        let connection = sql(Connection::open_with_flags(
            &self.path,
            OpenFlags::SQLITE_OPEN_READ_WRITE,
        ))?;
        configure(&connection)?;
        Ok(connection)
    }

    fn cleanup_new_database(&self) {
        let _ = fs::remove_file(&self.path);
        for suffix in ["-wal", "-shm"] {
            let mut sidecar = self.path.as_os_str().to_os_string();
            sidecar.push(suffix);
            let _ = fs::remove_file(PathBuf::from(sidecar));
        }
    }

    fn schema(transaction: &Transaction<'_>) -> Result<()> {
        sql(transaction.execute_batch("CREATE TABLE vault(singleton INTEGER PRIMARY KEY CHECK(singleton=1), metadata TEXT NOT NULL); CREATE TABLE notes(id TEXT PRIMARY KEY, encrypted TEXT NOT NULL); CREATE TABLE rollback(id TEXT PRIMARY KEY, previous_metadata TEXT NOT NULL, encrypted_backup BLOB NOT NULL); PRAGMA user_version=1;"))
    }

    pub fn setup(&mut self, pin: &str) -> Result<RecoveryResult> {
        if self.connection.is_some() {
            return Err(VaultError::AlreadyInitialized);
        }
        model::validate_pin(pin)?;
        let key = Zeroizing::new(crypto::random::<32>()?);
        let vault_id = Uuid::new_v4().to_string();
        let (codes, recovery) = crypto::new_codes(&vault_id, key.as_ref())?;
        let state = make_state(&vault_id, key.as_ref(), &[])?;
        let (credential_id, salt, wrapper) = self.enrollment(&vault_id, pin, key.as_ref())?;
        let meta = Metadata {
            version: VERSION,
            kdf_version: KDF_VERSION,
            vault_id,
            credential_id,
            salt,
            pin: wrapper,
            recovery,
            state,
        };
        let mut created = false;
        let operation = (|| {
            let mut connection = self.create_connection(&mut created)?;
            let transaction = sql(connection.transaction())?;
            Self::schema(&transaction)?;
            sql(transaction.execute(
                "INSERT INTO vault(singleton,metadata) VALUES(1,?1)",
                [encode(&meta)?],
            ))?;
            sql(transaction.commit())?;
            Ok(connection)
        })();
        match operation {
            Ok(connection) => {
                self.connection = Some(connection);
                self.key = Some(key);
                Ok(RecoveryResult { codes })
            }
            Err(error) => {
                let _ = self.store.delete(&meta.credential_id);
                if created {
                    self.cleanup_new_database();
                }
                Err(error)
            }
        }
    }

    fn key_from_pin(&self, meta: &Metadata, pin: &str) -> Result<Key> {
        model::validate_pin(pin)?;
        let secret = Zeroizing::new(
            self.store
                .get(&meta.credential_id)
                .map_err(|_| VaultError::SecureStore)?,
        );
        if secret.len() != 32 {
            return Err(VaultError::SecureStore);
        }
        let salt = STANDARD
            .decode(&meta.salt)
            .map_err(|_| VaultError::Corrupt)?;
        let derived = crypto::pin_key(pin, &secret, &salt)?;
        let bytes = crypto::unseal(
            derived.as_ref(),
            &meta.pin,
            &crypto::pin_aad(&meta.vault_id, &meta.credential_id),
            32,
        )?;
        if bytes.len() != 32 {
            return Err(VaultError::Corrupt);
        }
        let mut key = Zeroizing::new([0u8; 32]);
        key.copy_from_slice(&bytes);
        Ok(key)
    }

    pub fn unlock(&mut self, pin: &str) -> Result<()> {
        // A failed reauthentication must never preserve an earlier unlocked state.
        self.lock();
        let meta = read_metadata(self.connection()?)?;
        let key = self.key_from_pin(&meta, pin)?;
        let records = read_records(self.connection()?)?;
        validate_state(&meta, key.as_ref(), &records)?;
        validate_records(&meta.vault_id, key.as_ref(), &records)?;
        self.key = Some(key);
        Ok(())
    }

    pub fn lock(&mut self) {
        self.key = None;
    }

    pub fn recover(&mut self, code: &str, new_pin: &str) -> Result<RecoveryResult> {
        model::validate_pin(new_pin)?;
        self.lock();
        let mut meta = read_metadata(self.connection()?)?;
        let key = crypto::recover_key(code, &meta.vault_id, &meta.recovery)?;
        let records = read_records(self.connection()?)?;
        validate_state(&meta, key.as_ref(), &records)?;
        validate_records(&meta.vault_id, key.as_ref(), &records)?;
        let (codes, wrappers) = crypto::new_codes(&meta.vault_id, key.as_ref())?;
        let (id, salt, pin) = self.enrollment(&meta.vault_id, new_pin, key.as_ref())?;
        meta.credential_id = id;
        meta.salt = salt;
        meta.pin = pin;
        meta.recovery = wrappers;
        if let Err(error) = self.write_metadata(&meta) {
            let _ = self.store.delete(&meta.credential_id);
            return Err(error);
        }
        self.key = Some(key);
        Ok(RecoveryResult { codes })
    }

    fn write_metadata(&mut self, meta: &Metadata) -> Result<()> {
        let connection = self.connection.as_mut().ok_or(VaultError::Uninitialized)?;
        let transaction = sql(connection.transaction())?;
        sql(transaction.execute(
            "UPDATE vault SET metadata=?1 WHERE singleton=1",
            [encode(meta)?],
        ))?;
        sql(transaction.commit())
    }

    pub fn change_pin(&mut self, current_pin: &str, new_pin: &str) -> Result<()> {
        self.unlocked()?;
        model::validate_pin(new_pin)?;
        let mut meta = read_metadata(self.connection()?)?;
        let key = match self.key_from_pin(&meta, current_pin) {
            Ok(key) => key,
            Err(error) => {
                self.lock();
                return Err(error);
            }
        };
        if key.as_ref() != self.unlocked()? {
            self.lock();
            return Err(VaultError::Corrupt);
        }
        self.list_notes()?;
        let (id, salt, pin) = self.enrollment(&meta.vault_id, new_pin, key.as_ref())?;
        meta.credential_id = id;
        meta.salt = salt;
        meta.pin = pin;
        if let Err(error) = self.write_metadata(&meta) {
            let _ = self.store.delete(&meta.credential_id);
            return Err(error);
        }
        Ok(())
    }

    pub fn regenerate_codes(&mut self) -> Result<RecoveryResult> {
        self.list_notes()?;
        let key = self.unlocked()?;
        let mut meta = read_metadata(self.connection()?)?;
        let (codes, wrappers) = crypto::new_codes(&meta.vault_id, key)?;
        meta.recovery = wrappers;
        self.write_metadata(&meta)?;
        Ok(RecoveryResult { codes })
    }

    pub fn list_notes(&self) -> Result<Vec<Note>> {
        let key = self.unlocked()?;
        let meta = read_metadata(self.connection()?)?;
        let records = read_records(self.connection()?)?;
        validate_state(&meta, key, &records)?;
        let mut notes = validate_records(&meta.vault_id, key, &records)?;
        notes.sort_by(|a, b| {
            b.updated_at
                .cmp(&a.updated_at)
                .then_with(|| a.id.cmp(&b.id))
        });
        Ok(notes)
    }

    pub fn save_note(&mut self, input: NoteInput) -> Result<Note> {
        self.unlocked()?;
        model::validate_fields(&input.title, &input.content, &input.note_type, &input.tags)?;
        if input.id.as_ref().is_some_and(|id| !model::valid_id(id)) {
            return Err(VaultError::InvalidInput);
        }
        let notes = self.list_notes()?;
        let timestamp = model::now()?;
        let (id, created_at, updated_at) = match input.id {
            Some(id) => {
                let old = notes
                    .iter()
                    .find(|note| note.id == id)
                    .ok_or(VaultError::NotFound)?;
                (id, old.created_at, timestamp.max(old.updated_at))
            }
            None => {
                if notes.len() >= MAX_NOTES {
                    return Err(VaultError::LimitExceeded);
                }
                (Uuid::new_v4().to_string(), timestamp, timestamp)
            }
        };
        let note = Note {
            id,
            title: input.title,
            content: input.content,
            note_type: input.note_type,
            tags: input.tags,
            pinned: input.pinned,
            archived: input.archived,
            trashed: input.trashed,
            created_at,
            updated_at,
        };
        note.validate()?;
        let mut meta = read_metadata(self.connection()?)?;
        let key = self.unlocked()?;
        let bytes =
            Zeroizing::new(serde_json::to_vec(&note).map_err(|_| VaultError::InvalidInput)?);
        let sealed = crypto::seal(key, &bytes, &crypto::record_aad(&meta.vault_id, &note.id))?;
        let mut records = read_records(self.connection()?)?;
        records.retain(|r| r.id != note.id);
        records.push(Record {
            id: note.id.clone(),
            sealed: sealed.clone(),
        });
        meta.state = make_state(&meta.vault_id, key, &records)?;
        let transaction = sql(self
            .connection
            .as_mut()
            .ok_or(VaultError::Uninitialized)?
            .transaction())?;
        sql(transaction.execute("INSERT INTO notes(id,encrypted) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET encrypted=excluded.encrypted", params![note.id, encode(&sealed)?]))?;
        sql(transaction.execute(
            "UPDATE vault SET metadata=?1 WHERE singleton=1",
            [encode(&meta)?],
        ))?;
        sql(transaction.commit())?;
        Ok(note)
    }

    pub fn delete_note(&mut self, id: &str) -> Result<()> {
        self.unlocked()?;
        if !model::valid_id(id) {
            return Err(VaultError::InvalidInput);
        }
        let notes = self.list_notes()?;
        if !notes.iter().any(|note| note.id == id) {
            return Err(VaultError::NotFound);
        }
        let mut meta = read_metadata(self.connection()?)?;
        let mut records = read_records(self.connection()?)?;
        records.retain(|r| r.id != id);
        meta.state = make_state(&meta.vault_id, self.unlocked()?, &records)?;
        let transaction = sql(self
            .connection
            .as_mut()
            .ok_or(VaultError::Uninitialized)?
            .transaction())?;
        sql(transaction.execute("DELETE FROM notes WHERE id=?1", [id]))?;
        sql(transaction.execute(
            "UPDATE vault SET metadata=?1 WHERE singleton=1",
            [encode(&meta)?],
        ))?;
        sql(transaction.commit())
    }

    fn reject_database_destination(&self, destination: &Path) -> Result<()> {
        let absolute = |p: &Path| -> Result<PathBuf> {
            let parent = p
                .parent()
                .filter(|p| !p.as_os_str().is_empty())
                .unwrap_or_else(|| Path::new("."));
            let parent = parent.canonicalize().map_err(|_| VaultError::Backup)?;
            Ok(parent.join(p.file_name().ok_or(VaultError::Backup)?))
        };
        let db = absolute(&self.path)?;
        let dest = absolute(destination)?;
        if dest == db {
            return Err(VaultError::Backup);
        }
        for suffix in ["-wal", "-shm"] {
            let mut sidecar = db.as_os_str().to_os_string();
            sidecar.push(suffix);
            if dest.as_os_str() == sidecar {
                return Err(VaultError::Backup);
            }
        }
        if destination.exists() && destination.canonicalize().map_err(|_| VaultError::Backup)? == db
        {
            return Err(VaultError::Backup);
        }
        Ok(())
    }

    pub fn export_backup(&mut self, path: impl AsRef<Path>) -> Result<()> {
        self.unlocked()?;
        self.reject_database_destination(path.as_ref())?;
        let key = self.key.as_ref().ok_or(VaultError::Locked)?;
        let transaction = sql(self
            .connection
            .as_mut()
            .ok_or(VaultError::Uninitialized)?
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate))?;
        let meta = read_metadata(&transaction)?;
        let records = read_backup_records(&transaction)?;
        validate_state(&meta, key.as_ref(), &records)?;
        validate_records(&meta.vault_id, key.as_ref(), &records)?;
        let backup = make_backup(&meta, key.as_ref(), records)?;
        sql(transaction.commit())?;
        persist_atomic(path.as_ref(), &backup)
    }

    /// Recovery is the authentication gate for this operation; it intentionally works
    /// on a locked or absent vault. Replacing an existing vault additionally requires
    /// that vault to be unlocked, ensuring a verified encrypted rollback is retained.
    pub fn restore_backup(
        &mut self,
        path: impl AsRef<Path>,
        code: &str,
        new_pin: &str,
    ) -> Result<RecoveryResult> {
        if self.connection.is_some() {
            self.unlocked()?;
        }
        model::validate_pin(new_pin)?;
        let file = File::open(path.as_ref()).map_err(|_| VaultError::Backup)?;
        if !file.metadata().map_err(|_| VaultError::Backup)?.is_file() {
            return Err(VaultError::Backup);
        }
        if file.metadata().map_err(|_| VaultError::Backup)?.len() > MAX_BACKUP_BYTES {
            return Err(VaultError::LimitExceeded);
        }
        let mut bytes = Vec::new();
        file.take(MAX_BACKUP_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| VaultError::Backup)?;
        if bytes.len() as u64 > MAX_BACKUP_BYTES {
            return Err(VaultError::LimitExceeded);
        }
        let backup: Backup = serde_json::from_slice(&bytes).map_err(|_| VaultError::Corrupt)?;
        if backup.header.format != FORMAT || backup.header.version != VERSION {
            return Err(VaultError::UnsupportedVersion);
        }
        if !model::valid_id(&backup.header.vault_id) || backup.header.recovery.len() != CODE_COUNT {
            return Err(VaultError::Corrupt);
        }
        for wrapper in &backup.header.recovery {
            check_sealed(wrapper, 32)?;
        }
        let key = crypto::recover_key(code, &backup.header.vault_id, &backup.header.recovery)?;
        let aad = serde_json::to_vec(&backup.header).map_err(|_| VaultError::Corrupt)?;
        let plaintext = crypto::unseal(
            key.as_ref(),
            &backup.payload,
            &aad,
            MAX_BACKUP_BYTES as usize,
        )?;
        let preflight: SnapshotPreflight<'_> =
            serde_json::from_slice(&plaintext).map_err(|_| VaultError::Corrupt)?;
        if preflight.version != VERSION {
            return Err(VaultError::UnsupportedVersion);
        }
        if preflight.vault_id != backup.header.vault_id || !preflight.records.get().starts_with('[')
        {
            return Err(VaultError::Corrupt);
        }
        let snapshot: Snapshot = serde_json::from_slice(&plaintext).map_err(|error| {
            if error.to_string().starts_with("vault-limit") {
                VaultError::LimitExceeded
            } else if error.to_string().starts_with("vault-version") {
                VaultError::UnsupportedVersion
            } else {
                VaultError::Corrupt
            }
        })?;
        if snapshot.version != VERSION {
            return Err(VaultError::UnsupportedVersion);
        }
        if snapshot.vault_id != backup.header.vault_id {
            return Err(VaultError::Corrupt);
        }
        validate_records(&snapshot.vault_id, key.as_ref(), &snapshot.records)?;
        let (codes, recovery) = crypto::new_codes(&snapshot.vault_id, key.as_ref())?;
        let state = make_state(&snapshot.vault_id, key.as_ref(), &snapshot.records)?;
        // Capture a consistent, verified original before enrolling or changing anything.
        let rollback = if let Some(connection) = self.connection.as_mut() {
            let old_key = self.key.as_ref().ok_or(VaultError::Locked)?;
            let transaction = sql(
                connection.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            )?;
            let old_meta = read_metadata(&transaction)?;
            let old_records = read_backup_records(&transaction)?;
            validate_state(&old_meta, old_key.as_ref(), &old_records)?;
            validate_records(&old_meta.vault_id, old_key.as_ref(), &old_records)?;
            let backup = make_backup(&old_meta, old_key.as_ref(), old_records)?;
            sql(transaction.commit())?;
            Some((old_meta, backup))
        } else {
            None
        };
        let (credential_id, salt, pin) =
            self.enrollment(&snapshot.vault_id, new_pin, key.as_ref())?;
        let meta = Metadata {
            version: VERSION,
            kdf_version: KDF_VERSION,
            vault_id: snapshot.vault_id,
            credential_id,
            salt,
            pin,
            recovery,
            state,
        };
        let was_absent = self.connection.is_none();
        let mut created = false;
        let mut new_connection = None;
        let operation = (|| {
            if was_absent {
                new_connection = Some(self.create_connection(&mut created)?);
            }
            let connection = if was_absent {
                new_connection.as_mut().ok_or(VaultError::Storage)?
            } else {
                self.connection.as_mut().ok_or(VaultError::Storage)?
            };
            let transaction = sql(
                connection.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            )?;
            if was_absent {
                Self::schema(&transaction)?;
            }
            if let Some((old_meta, old_backup)) = &rollback {
                sql(transaction.execute(
                    "INSERT INTO rollback(id,previous_metadata,encrypted_backup) VALUES(?1,?2,?3)",
                    params![Uuid::new_v4().to_string(), encode(old_meta)?, old_backup],
                ))?;
            }
            sql(transaction.execute("DELETE FROM notes", []))?;
            sql(transaction.execute("INSERT INTO vault(singleton,metadata) VALUES(1,?1) ON CONFLICT(singleton) DO UPDATE SET metadata=excluded.metadata", [encode(&meta)?]))?;
            for record in &snapshot.records {
                sql(transaction.execute(
                    "INSERT INTO notes(id,encrypted) VALUES(?1,?2)",
                    params![record.id, encode(&record.sealed)?],
                ))?;
            }
            sql(transaction.commit())
        })();
        if let Err(error) = operation {
            drop(new_connection);
            let _ = self.store.delete(&meta.credential_id);
            if created {
                self.cleanup_new_database();
            }
            return Err(error);
        }
        if was_absent {
            self.connection = new_connection;
        }
        self.key = Some(key);
        Ok(RecoveryResult { codes })
    }
}

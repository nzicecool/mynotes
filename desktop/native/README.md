# MyNotes native vault

`mynotes-vault` is a real, independently compilable Rust library. It has no Tauri, browser, account, network, synchronization, or email dependency. SQLite contains encrypted vault records; the production OS credential-manager adapter is deliberately supplied by the desktop wrapper. The only in-memory credential adapter is compiled under `cfg(test)`.

## Native integration

```rust,no_run
use mynotes_vault::{Vault, SecretStore, Result, VaultError, NoteInput};
use std::path::PathBuf;

// Supply an OS credential-manager implementation. There is no file fallback.
fn use_vault(store: Box<dyn SecretStore + Send>, db: PathBuf) -> Result<()> {
    let mut vault = Vault::open(db, store)?;
    if !vault.status()?.initialized {
        let recovery = vault.setup("000007")?;
        // Show recovery.codes once and have the user save them offline.
        // Never log the PIN, codes, or note contents.
        drop(recovery);
    } else {
        vault.unlock("000007")?;
    }
    let note = vault.save_note(NoteInput {
        id: None, title: "A note".into(), content: "Text".into(),
        note_type: "plain".into(), tags: vec![],
        pinned: false, archived: false, trashed: false,
    })?;
    assert_eq!(vault.list_notes()?[0].id, note.id);
    vault.lock();
    Ok(())
}
```

The wrapper owns exactly one `Mutex<Vault>` per database and serializes all access. Do not open concurrent vault owners or externally modify its SQLite database. All filesystem paths originate in native application code/native dialogs, never in renderer-supplied IPC arguments. Keep the SQLite parent directory private to the user. Store outputs and dialogs must not log secrets. `Vault` deliberately has no `Debug` implementation.

The public credential boundary is:

```rust
use mynotes_vault::{Result, SecretStore};
// trait SecretStore: Send {
//     fn get(&self, id: &str) -> Result<Vec<u8>>;
//     fn set(&self, id: &str, secret: &[u8]) -> Result<()>;
//     fn delete(&self, id: &str) -> Result<()>;
// }
```

Use one OS keyring service namespace and the supplied unique credential UUID as the account identifier. Missing values, denied access, unavailable backends, invalid entries, and all OS credential-store errors must map to `VaultError::SecureStore`. `get`/`set` readback errors fail closed; there is no plaintext/file/environment fallback. The library also validates the secret is exactly 32 bytes. Enrollment sets a new credential ID and verifies readback before referencing it in SQLite; failures attempt cleanup of the new enrollment only, never overwrite/delete the previous enrollment. Old successful enrollments are intentionally retained for encrypted rollback data; the wrapper must not bulk-delete that keyring namespace.

### API

All public methods except `lock()` return the sanitized public `Result<T>` alias.

| Method | Result / behavior |
|---|---|
| `Vault::open(PathBuf, Box<dyn SecretStore + Send>)` | `Vault`; absent DB remains absent; existing malformed/unsupported DB is rejected, never reset; always starts locked |
| `status(&self)` | `VaultStatus { initialized, unlocked, recovery_codes_remaining }` |
| `setup(&mut self, pin: &str)` | `RecoveryResult`; initialize once and unlock |
| `unlock(&mut self, pin: &str)` | `()`; authenticate PIN envelope, empty-vault key confirmation, record inventory and every encrypted record; failed reauthentication locks |
| `lock(&mut self)` | `()`; infallibly drops/zeroizes native vault key |
| `recover(&mut self, code: &str, new_pin: &str)` | `RecoveryResult`; authenticate recovery code even when locked/keyring entry is missing, bind new device enrollment, rotate all codes, unlock |
| `change_pin(&mut self, current_pin: &str, new_pin: &str)` | `()`; requires unlocked vault and reauthentication; changes envelope only, not note ciphertext or codes |
| `regenerate_codes(&mut self)` | `RecoveryResult`; requires unlocked vault; replace all five current wrappers |
| `list_notes(&self)` | `Vec<Note>`; every record authenticated, descending updated timestamp then ID |
| `save_note(&mut self, NoteInput)` | `Note`; absent/null ID creates UUID; known ID updates and preserves created timestamp; unknown supplied ID rejected |
| `delete_note(&mut self, id: &str)` | `()`; permanent deletion, nonexistent ID rejected |
| `export_backup(&mut self, path: impl AsRef<Path>)` | `()`; requires unlocked; atomic encrypted portable snapshot |
| `restore_backup(&mut self, path: impl AsRef<Path>, code: &str, new_pin: &str)` | `RecoveryResult`; an absent vault can restore using its recovery code; replacing an initialized vault requires it unlocked so its original can be verified and retained |

DTOs exactly use JSON camelCase: `Note` has `id,title,content,noteType,tags,pinned,archived,trashed,createdAt,updatedAt`; `NoteInput` omits timestamps and accepts missing/null `id`; `VaultStatus` has `initialized,unlocked,recoveryCodesRemaining`; `RecoveryResult` has `codes`. Unknown fields are rejected. Timestamps are epoch milliseconds (`i64`, constrained to safe JavaScript integer range). Types are `plain`, `rich`, `markdown`, `checklist`, `code`, and `spreadsheet`; type-specific editor payloads remain opaque strings and are not HTML-rendered by this library.

## Security and format v1

* PIN: 6–128 ASCII numeric digits, preserving leading zeros. PINs are not parsed as integers. PINs and codes are neither stored plaintext nor logged.
* A random 32-byte vault key is held in a `Zeroizing` buffer while unlocked and destroyed on lock/drop. Derived keys, device secrets, recovery-code decoded keys, and decrypted/serialized JSON buffers use zeroizing memory. Caller-owned PIN strings, returned recovery strings, and returned note DTOs remain the caller's responsibility; no claim is made that Rust/OS allocators, crypto library internal copies, swap, or crash dumps are comprehensively scrubbed.
* Fixed/versioned PIN KDF v1: Argon2id v0x13, 64 MiB memory, 3 passes, parallelism 1, 32-byte output, independent random 16-byte salt. The KDF input is the PIN bytes followed by a random 32-byte device secret. The device secret exists only in native memory and the supplied OS credential store, never SQLite or backups. Tests use the same production KDF parameters; optimization is not a weaker test bypass.
* Five independently generated 256-bit recovery codes are uppercase hexadecimal, eight groups of eight digits. ASCII spaces, hyphens, and case are tolerated. Each decoded code independently keys an AES-256-GCM vault-key envelope. Random high entropy permits direct use as a wrapping key, avoiding PIN-grade brute-force weaknesses.
* AES-256-GCM uses fresh OS-random 96-bit nonces. The full serialized `Note`, including title, tags, type, flags and timestamps, is encrypted. Record AAD binds domain/type, format version, vault UUID, and record UUID. PIN/recovery envelopes and backup/state data use separate domains. No plaintext fallback exists. A sealed, authenticated sorted ID inventory detects deleted/added rows and confirms the vault key even on an empty database. Row counts, UUIDs, ciphertext sizes, format/KDF versions, and envelope metadata remain visible; SQLite is not whole-file encrypted.
* SQLite uses WAL, `foreign_keys=ON`, `synchronous=FULL`, a five-second busy timeout and transactions for every mutation. A new DB is created with exclusive-create semantics and Unix mode `0600`; encrypted export tempfiles are private. Platform-specific ACL hardening, screen lock/session handling, idle timers, clipboard policy, debug logging and renderer sanitation belong to the wrapper.
* Maximum 10,000 notes; each complete serialized Note JSON is at most 2 MiB, titles at most 16 KiB, 128 tags, each tag at most 256 bytes. The backup format adds encryption/base64 overhead: export and restore are both limited to **64 MiB total file bytes**. A legal large vault may exceed the portable limit; export then rejects rather than producing an unrestorable file. Unknown data/crypto/KDF versions are rejected.

### Portable backups and rollback

A portable v1 JSON file contains a public version/format/vault-ID/recovery-wrapper header and an AES-GCM encrypted snapshot payload. The complete canonical header, including all recovery wrappers, is AAD. The payload contains encrypted records; it is authenticated as a whole under the vault key and validated completely (including each Note, IDs, count, types, sizes, duplicate IDs) before enrollment/database writes. It contains **no PIN wrapper, credential ID, or device secret**. Portable restoration therefore needs one recovery code, not the old PIN or old computer.

Export reads a consistent SQLite `IMMEDIATE` transaction snapshot, authenticates every record, serializes only ciphertext, and writes via `tempfile` plus `fsync` and atomic rename. There is no blind copy of a live SQLite file and no plaintext temporary file. Export rejects the DB/WAL/SHM destinations. On Unix the containing directory is also synced. Restore bounds file reading even if a file grows during the read.

When replacing an existing usable vault, a verified encrypted snapshot of the original plus its original encrypted metadata is inserted into the SQLite `rollback` table **in the same transaction** as the replacement. The corresponding old credential-manager secret is retained. No destructive overwrite occurs until both replacement and rollback are committed. SQL/authentication/credential-store failures leave the original enrollment and records usable. Each successful restore rotates all five current codes and binds the restored key to a fresh random device secret and a new credential UUID. Previous encrypted rollback entries are not automatically pruned.

**Rotation cannot revoke old copies.** Recovery/regeneration invalidates all old codes for the current vault, but an old exported backup or retained rollback still has its own old wrappers and remains decryptable with its old codes. Securely dispose of old backups/codes if that access is unwanted. Similarly, an old copied DB plus its retained OS secret/PIN may remain decryptable; offline snapshots cannot provide cryptographic global revocation.

No automatic rollback UI/API or migration is implemented in v1. The rollback table is an encrypted native emergency retention mechanism, not a renderer-facing history/revision/folder feature. Restoring over a corrupt/unlockable existing DB is deliberately refused; a privileged recovery tool must preserve/rename it first. Old keyring entries and rollback snapshots consume space and need a future explicit native retention policy.

## Build and verification

```sh
cd /home/ubuntu/mynotes/desktop/native
source "$HOME/.cargo/env"
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
```

Tests use temporary real SQLite databases and a `cfg(test)` `MemoryStore`, not simulated storage. They cover setup/restart locked, leading-zero PINs, production KDF, credential failures/readback, full encrypted metadata in DB/WAL/backups, all six types, locked operations, authenticated tampering/deleted rows/record swaps, PIN changes without record re-encryption, code rotation, clean-computer portable restoration and retained old-copy usability, corrupt/wrong-code restore preservation, transaction failure, rollback credential retention, size/type/version validation and sanitized errors. No OS keyring integration is claimed by these library tests; that adapter must be validated separately by the parent wrapper.

### Verification record

On the available Rust 1.100.0 Linux toolchain, `cargo test --locked -- --test-threads=4` passed **31 tests, 0 failures, 0 ignored**; `cargo clippy --locked --all-targets -- -D warnings` and `cargo fmt --check` passed. The original unoptimized large-export regression made that run take 206.98 seconds. The test profile now optimizes the exact same implementation (no KDF/security test bypass) to reduce that repeated large-data encryption cost. The extra hostile-input regressions authenticate intentionally malformed snapshots and verify count/type/duplicate/version rejection before any DB or credential writes, test exclusive-create race preservation, reject plaintext fallback and unknown tables, and inject a SQL failure after rollback insertion to confirm the transaction preserves the original.

Final optimized verification: **31/31 tests passed in 6.27 seconds** after 66 seconds of fresh compilation. The chained command `cargo test --locked -- --test-threads=4 && cargo clippy --locked --all-targets -- -D warnings && cargo fmt --check` exited successfully. The optimized test profile still uses the fixed 64 MiB / three-pass production Argon2id KDF.

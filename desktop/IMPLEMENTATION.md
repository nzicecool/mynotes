# MyNotes Desktop v1 implementation

The user authorized implementation on 26 November 2026. This leaves the design-only workflow and implements the accepted single-user, offline-first scope. This document records the implementation choices; it is not a claim of completed tests or a signed release.

## Architecture

The desktop target has its own HTML/React entry, Vite build, and native Rust service. It does not load web login routes, Express, tRPC, MySQL, OAuth, AgentMail, or the web analytics/debug collector. Existing editors are reused through the client alias; the web/Pi target remains separate.

SQLite stores authenticated encrypted note records. Full record JSON includes titles, bodies, tags, flags, and timestamps. Opaque identifiers, record counts/sizes, format version, and encrypted-key envelopes remain observable. This is record encryption, not SQLCipher whole-file encryption.

A randomly generated vault key is held by the Rust service while unlocked. Normal unlock combines the PIN with a randomly generated secret persisted in the operating system credential store. macOS uses Keychain, Windows uses Credential Store, and Linux uses a running Secret Service provider. Setup must fail closed if persistence cannot be verified; there is no plaintext or mock fallback in the app. This protects a database copied without the credential-store secret, not an administrator or malware able to access the user's session and keys.

Five high-entropy recovery codes provide portable vault-key recovery. Backups do not contain the weak PIN-only access path or the device secret. Recovery/restore establishes new local PIN protection and generates a fresh code set. Old backups retain their old recovery access; there is no global single-use or retroactive revocation promise.

## File ownership

- `desktop/src/`: desktop interface, typed native adapter, save coordination, and unit tests.
- `desktop/native/`: independently testable Rust vault, encryption, SQLite, recovery, snapshots, and native tests.
- `desktop/src-tauri/`: Tauri executable, OS credential adapter, serialized command facade, local file dialogs, permissions, icon assets, and platform configuration.
- `desktop/vite.config.ts`, `desktop/vitest.config.ts`, `desktop/tsconfig.json`: isolated build and test targets.
- Root `package.json` and lockfile: additive desktop dependencies/scripts; existing web scripts are retained.
- Root `.gitignore`: excludes native outputs, generated schemas, and runtime vault/backup files.

## Ordered milestones

1. Freeze the typed IPC contract and desktop/web boundaries.
2. Implement and test the Rust vault, authenticated unlock, encrypted records, recovery, and safe backup/restore.
3. Implement desktop setup/lock/recovery, six editor types, local organisation, and guarded saving.
4. Integrate native credential storage, least-privilege command configuration, dialogs, and exclusive instance ownership.
5. Run desktop unit/type checks, native tests/lints, and the existing web tests/build.
6. Build and smoke-test the installed Linux desktop. Keep actual verification distinct from cross-platform build configuration.
7. Supply Linux artifacts and source; document how macOS/Windows users or platform CI can build. Signing/notarization and public release require separate credentials and verification.

## Sources consulted

- [Tauri capability boundaries](https://v2.tauri.app/security/capabilities/)
- [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Keyring 3.6.3 platform features](https://docs.rs/keyring/3.6.3/keyring/)
- [SQLite online backup support](https://docs.rs/rusqlite/0.37.0/rusqlite/backup/index.html)
- [Windows offline WebView2 installer](https://v2.tauri.app/distribute/windows-installer/)
- [macOS signing and notarization](https://v2.tauri.app/distribute/sign/macos/)
- [Windows signing limitations](https://v2.tauri.app/distribute/sign/windows/)

# MyNotes Desktop 0.1.0 — build results

Verified on 26 November 2026. This is an initial implementation of the accepted desktop v1 scope, not a universally validated or release-signed production release.

## Implemented scope

The Tauri 2 desktop application has a separate offline HTML/React entry and a Rust-owned vault. It uses encrypted local SQLite records and does not require the MyNotes web server, Docker, HTTPS, accounts, email configuration or a Raspberry Pi connection. There is no initial sync or automatic web/Pi database import.

It includes a numeric PIN lock, OS credential-store device secret, five high-entropy recovery codes, portable encrypted backups, six note editors, local search/tags, pinning, archive/trash, serialized autosave, and save-before-switch/lock/close coordination. Recovery replaces the entire current code set. Older backups retain their matching older codes.

Existing web/Pi production source is unchanged. Root changes add desktop dependencies/scripts and ignore rules. Previously tracked SQLite journal files were removed from the local repository index, not deleted from the running application's data directory. The GitHub desktop source branch starts from the actual GitHub main branch rather than inheriting unrelated local workflow history.

## Verified checks

`cargo test --locked --manifest-path desktop/native/Cargo.toml -- --test-threads=4` passed **31 tests, 0 failures**. The final repeated run took 6.62 seconds. These tests use real temporary SQLite databases and production cryptography, with a test-only in-memory credential adapter. They cover authenticated unlock, leading zeros, wrong PINs, locked CRUD, all six note types, encrypted metadata, tampered/deleted/swapped rows, PIN and recovery changes, portable backups, old-copy recovery limits, corrupt/wrong-code restore preservation, rollback transactions and size/version validation.

`pnpm desktop:check` passed. `pnpm desktop:test` passed **28 tests, 0 failures** across the native IPC boundary, frontend helpers and revision-aware save queue. The save tests cover serialization, overlapping edits, failure retention, explicit retry/discard and stale-result invalidation.

Native formatting checks passed for both Rust crates. Denied-warning Clippy checks passed for the native vault and Tauri wrapper. The integrated Tauri executable compiled in debug and optimized release profiles.

A clean GitHub-based source worktree installed successfully using **pnpm 10.4.1 with `--frozen-lockfile`**, then passed desktop type checking, all 28 desktop unit tests, production frontend build and the mandatory bundle guard. The guard catches accidental web/remote entry assets and missing shared dialog/layout CSS. This validates the deliverable source without relying on the original workspace's installed packages.

The existing web/Pi target passed `pnpm check`, **54 SQLite-backed tests, 0 failures**, and `pnpm build` after the desktop additions.

## Real native runtime tests

`desktop/tests/run_linux_smoke.sh` uses Xvfb, a fresh DBus session, disposable XDG directories, real GNOME Keyring, WebKitWebDriver and tauri-driver. The UI/native boundary is not mocked. No PIN, recovery code or personal note data is written to its report; the screenshots contain disposable test notes.

The integrated debug executable passed first-run UI setup and code acknowledgement; creating and editing all six note types; committing a still-pending checklist item before lock; clearing editor state and denying native CRUD while locked; wrong-PIN rejection; PIN change; recovery and invalidation of the previous current code set; deletion; persistence; and locked startup after a real process restart. Locked-vault replacement is rejected by the interface before a file chooser or mutation.

The executable extracted from the **final Debian package passed the same real runtime smoke test**. The package was unpacked into a temporary test directory, not installed into system directories. Package identity, architecture and runtime dependencies were inspected; APT installation, application-menu integration and uninstall were not independently automated.

The **exact final AppImage passed the same real runtime smoke test**, including persistence after restart, with `APPIMAGE_EXTRACT_AND_RUN=1`. A first restart attempt exposed a WebDriver/AppImage-launcher cleanup issue: the driver killed the launcher but left its native child holding single-instance ownership. The test harness now uses bounded requests and terminates only native children belonging to its exact disposable XDG directory before restart. The corrected run passed; no app/vault change was needed. FUSE mounting was not tested in this sandbox.

The Linux headless session emitted accessibility, graphics/portal/PipeWire warnings; the AppImage also emitted a missing GStreamer appsink warning. The tested notes/editor/vault operations still passed. Media playback is not a desktop v1 feature.

## Artifacts and compatibility

The built artifacts are `MyNotes-Desktop_0.1.0_amd64.deb` and `MyNotes-Desktop_0.1.0_amd64.AppImage`. Both are Linux **x86-64** test builds, made on **Ubuntu 24.04.5 LTS with glibc 2.39**, Node.js 22.23.4 and Rust 1.100.0. They are not Raspberry Pi/ARM builds. Older distribution compatibility has not been verified; AppImage is not a guarantee of portability to every Linux system.

The Debian package declares WebKitGTK 4.1, GTK 3, DBus, GNOME Keyring, XDG Desktop Portal and its GTK file-chooser backend. Compatible desktop services must be available before offline use. Node.js and Rust are development dependencies, not requirements for running the installed app. Missing system dependencies may require a one-time online package installation.

The Linux installers are not release-signed. macOS app/DMG and Windows NSIS/offline-WebView2 configurations are included, along with an inactive cross-platform CI template under `desktop/ci`. **No native macOS/Windows build, installer, runtime validation, signing or notarization is claimed.** No live GitHub workflow or public release was activated.

## macOS source-build troubleshooting update — 27 November 2026

A user reported dependency installation failing at the web/Pi server's `better-sqlite3@12.9.0`, followed by missing `tsc`, `vitest`, and `tauri`. Desktop uses Rust `rusqlite` with bundled SQLite, not that Node native module. A fresh source checkout was verified on Linux using `NODE_ENV=development pnpm install --frozen-lockfile --prod=false --ignore-scripts`: all three local tools were available, desktop TypeScript passed, all 28 desktop unit tests passed, and the production desktop frontend plus bundle guard passed. This verifies the desktop-only install path on Linux, not a native Mac build. Skipping dependency install scripts does not repair the web/Pi server's native module, and optional platform dependencies must remain enabled.

The user subsequently reported macOS DMG packaging failing in `bundle_dmg.sh` with Finder `AppleEvent timed out. (-1712)` and `Failed running AppleScript`. The recommended Mac guide now selects `pnpm run desktop:build:macos --bundles app`, bypassing the optional Finder/AppleScript DMG layout step. The configured app/DMG targets and signing settings are unchanged. This report shows that the user's build reached installer packaging; it is not verification of a complete usable app, successful installation, Keychain behavior, or Mac runtime. No successful app-only Mac build has been confirmed in this task.

See `MACOS.md` for comment-free zsh commands, local tool checks, both reported errors, and optional DMG packaging.

## Remaining limits before a broader production release

Use manual Lock vault or Ctrl/Cmd+L; there is no inactivity, blur or suspend-triggered lock. Use the operating system's screen lock when away. Ordinary native close has a save/lock fence, but OS window-manager close and interactive save-failure/backup-dialog paths have not all been end-to-end automated. Native backup/restore correctness is covered by the Rust tests; interactive file-chooser selection/cancellation is not part of the completed smoke test.

Each complete encrypted note is limited to 2 MiB and a vault to 10,000 notes. Portable backup files are capped at **64 MiB including format overhead**; a larger otherwise-valid vault can reject export. Native CRUD authenticates the full collection, so ordinary operations are O(total notes); large-vault performance is not validated.

An existing vault must be unlocked before backup replacement. A corrupt/unlockable existing database is deliberately not overwritten. Successful replacement retains encrypted rollback data and its prior credential enrollment, but v1 has no renderer-facing rollback/pruning tool. Old backups/copies and their keys are not globally revoked by code rotation.

SQLite is encrypted at the record level, not with SQLCipher full-file encryption: counts, opaque IDs, ciphertext lengths, version information and encrypted envelopes remain visible. PIN protection includes an OS-held device secret but does not defeat an administrator or malware in the user's OS session. Locking clears application references and the native key, not every forensic copy in RAM, swap, crash dumps or screenshots. A fully disconnected network test and independent security audit remain future release checks.

See `README.md` for first use, Linux installer commands, native platform build prerequisites, recovery/backup handling and the disposable smoke runner. See `native/README.md` for the exact crypto format and native API guarantees.

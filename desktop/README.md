# MyNotes Desktop

MyNotes Desktop is a Tauri 2 application for a single user's offline notes. It uses local SQLite and authenticated encrypted records, not the web application's Express server. There is no login, registration, email configuration, Docker requirement, or Raspberry Pi connection.

The desktop source is now on **`main`**, alongside the unchanged web/Pi target. **Mac users: follow the [complete macOS source-build and installation guide](MACOS.md).** No Mac installer has been released; the Linux `.deb` and `.AppImage` files are not Mac installers.

Version 0.1.0 is an initial desktop build. See the [verification report](BUILD-RESULTS.md) for what was actually compiled and tested on Linux. Native macOS/Windows builds and runtime behavior have not been verified. Platform configurations are not proof of a tested or signed public release.

## First use

Create a numeric PIN with at least six digits. Leading zeros are allowed. Save all five recovery codes somewhere separate from this computer before leaving setup. They are vault-access secrets: anyone who has a code and the corresponding vault/backup may be able to read your notes.

The application stores an additional secret in your operating system's credential store. This prevents the PIN alone from unlocking a copied database without that secret. It does not protect against an administrator or malware able to access your OS session. The PIN is not equivalent to a strong passphrase.

On Linux, a working Secret Service provider is required, such as GNOME Keyring or a compatible desktop keyring service. It must be available in your desktop session. MyNotes fails closed if secret persistence cannot be verified; it never falls back to plaintext or mock storage. A headless server without a desktop credential service is not the intended runtime.

## Notes and locking

Use plain text, rich text, Markdown, checklist, code, or spreadsheet notes. Tags, pinning, archive/trash, and local search organise the vault. Search runs over unlocked local notes; nothing is sent to a server.

Saving is automatic after a short idle delay, with a manual save action. Manual lock and ordinary close must finish pending saves before discarding editor state. If saving fails, resolve the error or explicitly choose to discard unsaved changes; do not assume an edit is saved until the application reports it.

The lock policy is manual only: there is no automatic lock on idle, window blur, or system suspend. The vault starts locked after restart. Unlocked plaintext necessarily exists in the webview while you edit. Locking clears application references and editor state, but cannot promise forensic erasure from RAM, swap, OS screenshots, or crash dumps.

## Forgotten PIN and recovery codes

Use a recovery code to regain access and set a replacement PIN without deleting notes. Recovery or code regeneration creates a new set of five codes for the current vault. Save the new set before dismissing it.

Old codes may still unlock old copied vaults or backups. There is no globally enforced single-use or retrospective revocation in a fully offline app. Resetting a PIN or replacing recovery envelopes does not withdraw access already granted through an old copy of the same encryption key. Keep old backups and their matching recovery secrets protected.

If the PIN/device credential and all usable recovery codes are lost, the application cannot recover encrypted data. It has no email reset or cloud-held recovery key. Codes recover access; they do not replace an actual backup of the notes.

## Encrypted backup and restore

Export a manual `.mynotes-backup` through the native save dialog. Backups contain an authenticated encrypted snapshot and recovery-key envelopes, not the device secret or a portable weak-PIN-only unlock path. Store a recovery code from that backup's code set separately.

To move to another supported computer, install MyNotes and restore the backup using its recovery code. An existing vault must be unlocked before it can be replaced by a restore. If no vault exists on the destination, portable restore is permitted without first creating or unlocking a vault. Set a new local PIN, then save the fresh recovery codes. Restore replaces the active vault only after authentication and validation. Existing data is preserved on failed validation; successful replacement also retains a pre-restore rollback snapshot as described in the native library documentation.

Backup files are capped at 64 MiB. The current implementation processes the whole note collection for note loading/saving, search, and backup operations: these are O(total notes), not constant-time per-note operations. Large vaults can therefore require more time and memory; v1 is not a large-vault scalability claim.

Do not directly copy only a live `vault.db` file as a portable backup: SQLite journals and device credentials are separate concerns. Existing MyNotes web/Pi databases are not automatically imported in v1.

## Data location and privacy

Tauri resolves a per-user application-data directory using the identifier `io.senath.mynotes.desktop`; its `vault.db` is separate from the web/Pi database. Common locations are under macOS Application Support, Windows AppData, and Linux XDG data directories. Use the OS-resolved location rather than assuming the current working directory.

The database encrypts note titles, bodies, tags, flags, and timestamps inside records. It is not SQLCipher full-file encryption. Counts, opaque record identifiers, ciphertext sizes, version information, and encrypted-key envelopes remain observable. No PINs, device secret, recovery codes, or plaintext notes should be written to application logs or plaintext cache files.

## Trying the Linux test installers

The supplied 0.1.0 installers are Linux x86-64 test builds made on Ubuntu 24.04 with glibc 2.39. Use a compatible desktop with WebKitGTK 4.1, a working credential service and XDG file-chooser portal. These files are not ARM/Raspberry Pi builds, and compatibility with older Linux distributions has not been verified. They are not release-signed artifacts.

For the Debian package, install from the download directory with `sudo apt install ./MyNotes-Desktop_0.1.0_amd64.deb`, then launch MyNotes Desktop from your application menu. APT may need internet access to install missing system dependencies; the installed note vault operates offline.

For the AppImage, run `chmod +x MyNotes-Desktop_0.1.0_amd64.AppImage` followed by `./MyNotes-Desktop_0.1.0_amd64.AppImage`. If FUSE is unavailable, try `APPIMAGE_EXTRACT_AND_RUN=1 ./MyNotes-Desktop_0.1.0_amd64.AppImage`. AppImage does not replace your OS keyring or portal services, and is not a guarantee of compatibility with every Linux system.

## Building from source

End users run installed applications without Node.js or Rust. Use Node.js **22.x**, pnpm **10.4.1**, Rust stable **1.90 or newer** for the native app, and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). The Linux source-build reference used Node.js 22.23.4 and Rust 1.100.0; the inactive CI template records these versions. They are not macOS-tested toolchain versions or proof of successful verification on every operating system. The [macOS guide](MACOS.md) includes complete prerequisite installation steps.

### Get the source from `main`

For a fresh checkout (choose a parent directory where `mynotes` does not already exist):

```sh
git clone --branch main https://github.com/nzicecool/mynotes.git mynotes
cd mynotes
```

For an existing clone, first enter its repository root and run `git status`. **Commit your work or stash it before switching branches**; `git stash push --include-untracked` is an option if you are not ready to commit. Keep the stash until you deliberately restore it, and protect any local-only files. Then:

```sh
git switch main
git pull --ff-only origin main
```

If there is no local `main` yet, fetch it with `git fetch origin` and use `git switch --track origin/main` instead of `git switch main`. These examples assume `origin` is the upstream MyNotes repository; check `git remote -v` in an existing clone. If the fast-forward pull refuses, stop and resolve your branch history rather than resetting or discarding work. No desktop feature-branch checkout is needed.

### Install dependencies and run desktop checks

After installing Node and Rust, install the pinned pnpm into your user directory without `sudo` or Corepack:

```sh
npm install --global --prefix "$HOME/.local" pnpm@10.4.1
export PATH="$HOME/.local/bin:$PATH"
```

Repeat the export in each new Terminal, or manually add the same line to `~/.zshrc` if using zsh. The first dependency install and build need internet to download dependencies.

Run these commands **from the repository root**, where `package.json` and `pnpm-lock.yaml` live, not from `desktop/` or `deploy/`:

```sh
pnpm install --frozen-lockfile
pnpm desktop:check
pnpm desktop:test
pnpm desktop:test:native
pnpm desktop:dev
```

The Tauri hooks invoke the repository scripts `pnpm desktop:dev:web` and `pnpm desktop:build:web`; do not replace them with commands that assume pnpm stays in the `desktop` directory. Desktop does not require `.env`, `DATABASE_DRIVER`, `pnpm build`/`pnpm start`, `setup-local.sh`, HTTPS, Docker, or a MyNotes server.

### Linux

On Linux, install build dependencies, WebKitGTK 4.1, DBus, and a working Secret Service provider. On Debian/Ubuntu:

```sh
sudo apt update
sudo apt install build-essential pkg-config curl libwebkit2gtk-4.1-dev \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
  libdbus-1-dev gnome-keyring xdg-desktop-portal xdg-desktop-portal-gtk
pnpm desktop:build
```

The Linux build produces Debian and AppImage targets under `desktop/src-tauri/target/release/bundle/`. An AppImage still uses your system's desktop services; it does not provide a private credential store. Native backup file choosers require a working XDG Desktop Portal and file-chooser backend. Install required dependencies before taking an offline computer into use.

### Windows

On Windows, use a native Windows development environment with Microsoft C++ Build Tools and WebView2:

```sh
pnpm desktop:build:windows
```

The Windows configuration uses an NSIS installer with the offline WebView2 installer embedded. Build-time downloads are expected; installed vault operation does not require a MyNotes server. Windows/OS webview update traffic is separate from application vault traffic.

### macOS

Use the [complete macOS guide](MACOS.md) for Xcode Command Line Tools, Node.js 22.x, pnpm 10.4.1, Rust, architecture selection, and safe source updates. Build **on a Mac**, using a native Apple Silicon (`arm64`) or Intel (`x64`) Node installation matched to rustup's default host. There is no universal-binary or verified Mac compatibility claim.

With prerequisites installed and the source checked out from `main`, run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm desktop:check
pnpm desktop:test
pnpm desktop:test:native
pnpm desktop:build:macos
open desktop/src-tauri/target/release/bundle/macos
```

The default outputs are `desktop/src-tauri/target/release/bundle/macos/MyNotes Desktop.app` and DMGs in `desktop/src-tauri/target/release/bundle/dmg/`. Drag **MyNotes Desktop.app** into **Applications** (`/Applications`), then open it there. These are expected output paths, not evidence of a completed Mac build.

The macOS configuration targets `app` and `dmg` with ad-hoc signing (`signingIdentity: "-"`) for local testing. This is neither Developer ID signing nor notarization and can produce Gatekeeper warnings. Only for this specific app, if you trust its source and it is blocked as unnotarized, follow [Apple's Open Anyway guidance](https://support.apple.com/en-us/102445) in **System Settings → Privacy & Security**. Do not disable Gatekeeper, globally strip quarantine attributes, or bypass malware/damaged-app warnings. See the [macOS guide](MACOS.md#4-install-and-open-your-local-build) for details.

Public distribution needs an appropriate signing identity and notarization. Windows public signing and SmartScreen reputation also require separate arrangements. No signing purchases or public-release submissions are included in this initial build.

macOS and Windows native builds, installers, runtime behavior, signing, and notarization have not been verified in this Linux source-build environment. Their configurations and template jobs are intended build paths, not evidence of completed platform testing or release signing.

## Tests and release workflow

`pnpm check`, `DATABASE_DRIVER=sqlite pnpm test`, and `pnpm build` remain the web/Pi commands. Desktop commands are additive and independent.

`ci/desktop-build.yml` remains an inactive workflow template under `desktop/ci`, not a live GitHub Actions workflow; this implementation does not install or activate it under `.github/workflows`. It describes Linux x86_64, Windows x86_64, macOS arm64, and macOS x86_64 test builds with explicit Rust targets. Native vault tests run directly from `desktop/native`; the template uses Bash consistently across runners, including Windows. Build jobs do not substitute for interactive credential-store/runtime testing or public-release signing. Never publish an unsigned or untested artifact as a verified production release. Automatic application update checks are outside v1.

For the real Linux UI/keyring smoke test, install `xvfb`, `dbus-x11`, `webkit2gtk-driver`, GNOME Keyring, Python Selenium and `cargo install tauri-driver --locked`. Build the executable, then run:

```sh
bash desktop/tests/run_linux_smoke.sh \
  --application "$PWD/desktop/src-tauri/target/debug/mynotes-desktop"
```

The runner creates temporary XDG directories, a fresh DBus session and a disposable keyring. It never uses your normal MyNotes vault and removes its test data on exit. It tests actual setup, all six editors and flush-before-lock, native lock enforcement, PIN/recovery changes, and restart persistence. The low-level Python test refuses to run without the runner's disposable-session marker.

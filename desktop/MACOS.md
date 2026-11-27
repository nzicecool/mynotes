# MyNotes Desktop on macOS

This guide builds MyNotes Desktop from the source now on **`main`**. You do not need the old desktop feature branch. There is **no released Mac installer** to download: the available Linux `.deb` and `.AppImage` files are **not Mac installers**.

**Platform status:** a Mac user reached DMG packaging, but it failed with a Finder AppleEvent timeout; successful app installation and runtime have **not been verified**. A completed native Mac build, Keychain integration, signing, and notarization also remain unverified. Reaching installer packaging is not proof that the app runs. The instructions below describe the repository's intended native build path, not a tested Mac release. The [verification report](BUILD-RESULTS.md) records the actual Linux checks and remaining limits; the [desktop guide](README.md) explains the vault and other platforms.

Desktop is a separate, single-user offline app. It does **not** need an `.env` file, `DATABASE_DRIVER`, the web/Pi `pnpm build` or `pnpm start` commands, `setup-local.sh`, HTTPS, Docker, a database server, or a MyNotes server. The first dependency installation and build **do need internet** to download JavaScript/Rust dependencies and build resources. Node, pnpm, and Rust are build tools, not requirements for running the installed app.

## 1. Install the Mac build prerequisites

Open **Terminal**. Use a native Terminal session and matching tools for your Mac:

| Mac | Node architecture | Default Rust host |
|---|---|---|
| Apple Silicon (M-series) | `arm64` | `aarch64-apple-darwin` |
| Intel | `x64` | `x86_64-apple-darwin` |

Use native Apple Silicon tools rather than mixing a Rosetta/x64 Node installation with arm64 Rust. Node and rustup's default host must match the intended native architecture. This guide builds for the local host only: it does not produce a universal binary or promise verified support for either Mac architecture. The macOS configuration's minimum system version of 11.0 is a build setting, not a tested compatibility guarantee.

### Xcode Command Line Tools

Run:

```sh
xcode-select --install
```

Complete the installation dialog and **wait for installation to finish** before continuing. If macOS says the tools are already installed, verify their selected location:

```sh
xcode-select -p
```

This should print a developer-tools path, commonly `/Library/Developer/CommandLineTools` (or a developer directory inside an installed Xcode). If it reports an error, finish or repair the installation first. See [Apple's Command Line Tools guidance](https://developer.apple.com/xcode/resources/) and the [Tauri macOS prerequisites](https://v2.tauri.app/start/prerequisites/).

### Node.js 22.x and pnpm 10.4.1

Install **Node.js 22.x** from the [official Node.js downloads](https://nodejs.org/en/download), selecting the release and architecture for your Mac. Do not simply choose a newer major version because it is the current default. The recorded Linux reference was **22.23.4**; that exact version has not been tested here on macOS.

Once Node and npm are available in Terminal, install the repository's pinned pnpm version into your own home directory. No `sudo` or Corepack setup is required:

```sh
npm install --global --prefix "$HOME/.local" pnpm@10.4.1 &&
export PATH="$HOME/.local/bin:$PATH"
```

Repeat that `export` in each new Terminal, or manually add the same line to `~/.zshrc` if you use the default zsh shell. Open a new Terminal after editing the file. This guide does not overwrite your shell configuration.

### Rust stable

Follow the [official rustup installer](https://rustup.rs/) linked from the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). For a new Rust installation:

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh &&
source "$HOME/.cargo/env"
```

Use the installer's standard stable toolchain and default host for your native architecture. If Rust is already managed by rustup, update it instead of reinstalling:

```sh
source "$HOME/.cargo/env" &&
rustup update stable
```

The complete native desktop app requires **Rust 1.90 or newer**. Rust **1.100.0** is the recorded Linux reference, not a macOS-tested requirement. If you have a directory-specific toolchain override, updating stable alone may not change the compiler selected there; check the active version from the repository root before building.

Verify the tools:

```sh
node --version &&
pnpm --version &&
rustc --version
```

Expect Node `v22.x`, pnpm `10.4.1`, and Rust at least `1.90`. To check architecture, `node -p 'process.arch'` should match the table above, and `rustc -vV` shows the Rust `host`. Fix a mismatch before building rather than adding cross-compilation targets to these instructions.

## 2. Get the source from `main`

### Fresh clone

Choose a parent directory where a folder named `mynotes` does not already exist, then run:

```sh
git clone --branch main https://github.com/nzicecool/mynotes.git mynotes &&
cd mynotes
```

### Existing clone

Enter your existing clone's repository root and inspect your work and remote:

```sh
git status &&
git remote -v
```

**Commit your work or stash it before switching branches.** If you are not ready to commit, `git stash push --include-untracked` can preserve tracked and untracked changes; keep the stash until you deliberately restore it. Protect any local-only or ignored files separately. Do not use a hard reset or delete your changes just to follow this guide.

The commands below assume `origin` points to the upstream MyNotes repository:

```sh
git switch main &&
git pull --ff-only origin main
```

If the clone has no local `main`, first run `git fetch origin`, then use `git switch --track origin/main` instead of `git switch main`, followed by the same fast-forward pull. If the pull refuses because your local branch has diverged, stop and resolve the history rather than forcing an overwrite. The desktop code is already on `main`; no feature-branch checkout is needed.

## 3. Check and build the desktop app

Run everything in this section from the **repository root** — the folder containing `package.json`, `pnpm-lock.yaml`, `patches/`, and `desktop/`. Do not run these commands from `desktop/` or `deploy/`.

### Install dependencies for desktop only

Use this recommended desktop-only installation command:

```sh
NODE_ENV=development pnpm install --frozen-lockfile --prod=false --ignore-scripts
```

`--prod=false` includes development tools such as TypeScript, Vitest, and the Tauri CLI; `NODE_ENV=development` makes the intended installation environment explicit. `--ignore-scripts` skips package lifecycle scripts, including the web/Pi `better-sqlite3` native-module build. It does not skip the desktop checks or the later Rust/Tauri build. The desktop vault uses Rust **`rusqlite` with bundled SQLite**, not the web/Pi `better-sqlite3` module.

Keep the tracked `pnpm-lock.yaml` and `patches/` files. Keep **optional dependencies** enabled: tools such as esbuild/Rollup need their platform-specific optional binaries. Do not add `--no-optional`, delete patches, or regenerate the lockfile to get past an installation error.

This bypass is **only for the desktop dependency path**. It does not fix or validate a web/Pi installation: web/Pi SQLite needs a normal installation and any necessary native rebuild as separate work before using that target.

After the install succeeds, check the repository-local tools:

```sh
pnpm exec tsc --version &&
pnpm exec vitest --version &&
pnpm exec tauri --version
```

Do not continue after a failed install or install global `tsc`, `vitest`, or `tauri` to conceal missing local tools. Do not ignore TypeScript failures or remove checks to make a build appear successful.

**Installation-path validation:** in a fresh Linux git archive, the desktop-only command above succeeded; the three local tool version checks, desktop typecheck, all 28 frontend tests, and desktop production bundle plus bundle guard passed. This validates that dependency path on Linux, not macOS installation, runtime, or Keychain behavior.

### Recommended build: app only

Run the checks and build with `&&` so the sequence stops at the first failure:

```sh
pnpm desktop:check &&
pnpm desktop:test &&
pnpm desktop:test:native &&
pnpm run desktop:build:macos --bundles app
```

The checks cover desktop TypeScript, frontend/IPC unit tests, and Rust vault tests. Passing unit tests alone does not verify macOS runtime or Keychain behavior.

`desktop:build:macos` invokes the repository's Tauri CLI with `desktop/src-tauri/tauri.macos.conf.json`. Its hook builds the **desktop** frontend and runs the bundle guard automatically; do not substitute the web/Pi build. pnpm forwards arguments after the script name, so use `pnpm run desktop:build:macos --bundles app` exactly as shown, with **no extra `--` separator**.

`--bundles app` builds **MyNotes Desktop.app** without the DMG wrapper or Finder-driven DMG layout step. With the default host build and no custom target/output overrides, the expected output is:

- App: `desktop/src-tauri/target/release/bundle/macos/MyNotes Desktop.app`

These paths describe intended output, not an assertion that a native Mac build has passed. If the CLI reports a build or packaging error, keep its first useful error and resolve it before treating the output as complete.

### Optional DMG packaging

A DMG is an optional installer wrapper, not required to copy the app to Applications or use the desktop vault. After successful checks and an app-only build, you may separately request it:

```sh
pnpm run desktop:build:macos --bundles dmg
```

Use this only on a graphical, unlocked Mac with Finder automation working. It may still time out; this is not a promised fix for Finder/AppleScript errors. The expected disk images are in `desktop/src-tauri/target/release/bundle/dmg/`, with version/architecture details in the filename.

The source configuration remains unchanged: without a `--bundles` override, `pnpm run desktop:build:macos` still requests both `app` and `dmg`, with ad-hoc `signingIdentity: "-"`. The recommended app-only command overrides the bundle selection for that invocation, not the configuration or vault behavior.

## 4. Install and open your local build

After a successful build, open the app's output folder:

```sh
open desktop/src-tauri/target/release/bundle/macos
```

Drag **MyNotes Desktop.app** into **Applications** (`/Applications`). Alternatively, open a generated disk image from `desktop/src-tauri/target/release/bundle/dmg/` and copy the app to Applications. Launch the copied app from Applications, rather than leaving it inside a mounted disk image. Installation and runtime still need to be verified on your Mac.

### Signing and macOS security warnings

Ad-hoc signing is for local testing. It is **not Developer ID signing and not notarization**; this is not an Apple-verified public release and Gatekeeper may block it.

Only if you trust the source and the particular app you built, and macOS blocks that **specific app as unnotarized/from an unidentified developer**, follow [Apple's official guidance](https://support.apple.com/en-us/102445): try opening it, then look in **System Settings → Privacy & Security** for **Open Anyway**, if offered for that app, and review the confirmation carefully.

Do **not** disable Gatekeeper or globally strip quarantine attributes. Do **not** bypass a malware warning, a warning that the app will damage your computer, or a damaged-app warning. Stop and investigate the source, build output, and Apple's advice instead. Public distribution requires separate Developer ID signing and notarization work that has not been completed or verified here.

## 5. Set up and protect your notes

On first launch, create a **numeric PIN with at least six digits**; leading zeros are allowed. Save **all five recovery codes somewhere separate from this Mac** before leaving setup. Anyone holding a matching recovery code and vault or backup may be able to access its notes.

The macOS implementation uses the **native Keychain** to store an additional device secret; the PIN alone is not enough to unlock a copied database without that secret. This integration is configured in source but has not been runtime-tested on a Mac. It does not protect against malware or an administrator able to access your OS session, and a short numeric PIN is not equivalent to a strong passphrase. If credential persistence fails, resolve the error rather than expecting a plaintext fallback.

Use **Lock vault** manually when you finish, and use macOS's screen lock when leaving the computer. Desktop v1 has no automatic lock on inactivity, window blur, or suspend; it starts locked after restart. Resolve any pending-save error before assuming your edit is safely stored.

Recovery codes recover access — **they are not a backup of your notes**. Export a portable encrypted v1 `.mynotes-backup` through the app and store a code from that backup's matching code set separately. Restore on another computer using the backup and its recovery code, then set a new local PIN and save the new codes. Do not treat a copy of a live `vault.db` alone as a portable backup. Old backups can still be unlocked by their matching old codes; changing codes does not revoke old copies. See [encrypted backup and restore](README.md#encrypted-backup-and-restore) for replacement rules and the 64 MiB limit.

Desktop v1 has **no Raspberry Pi sync or automatic import of existing web/Pi databases**. Your desktop vault is separate from the web/Pi installation.

## Troubleshooting

### `better-sqlite3` installation failure, then missing desktop tools

The reported Mac installation failed while compiling `better-sqlite3`; subsequent `tsc`, `vitest`, and `tauri` command-not-found errors were downstream symptoms of an incomplete dependency installation, not a reason to install those tools globally. Without the full first failure log, do not assume a specific Node ABI, Python, or SDK root cause.

For **desktop only**, return to the repository root and retry the installation in section 3 with `NODE_ENV=development`, `--prod=false`, and `--ignore-scripts`. Only after it succeeds, run the local tool version checks and the desktop checks. Preserve the lockfile, patches, and optional dependencies. If it still fails, capture the first useful installation error; do not bypass TypeScript failures or treat the web/Pi native module as repaired.

### `zsh: command not found: #` when pasting commands

Interactive zsh may treat pasted comment lines beginning with `#` as commands when interactive comments are not enabled. The copyable command blocks in this guide contain no comment lines. Copy only the commands inside a block, not Markdown fences, headings, explanatory text, or a shell prompt. A `#` error is not a TypeScript/Tauri installation diagnosis. The `&&` sequences stop at the first failed command.

### DMG Finder/AppleScript timeout

Errors mentioning `bundle_dmg.sh`, `AppleEvent timed out. (-1712)`, and `Failed running AppleScript` identify the DMG installer-packaging stage, including its Finder layout automation. They are not proof that app installation, launch, or vault operations succeeded, and do not by themselves diagnose a vault or TypeScript problem.

Use the recommended app-only build sequence in section 3, ending with `pnpm run desktop:build:macos --bundles app`. This skips the Finder-driven DMG layout step while preserving the same desktop app and vault functionality. Once that build succeeds, copy the resulting `.app` to Applications and verify launch and vault behavior separately. Do not delete or reset an existing vault to resolve packaging trouble. There is no need to disable macOS security, force-kill Finder, or force-unmount disks as part of this workaround. Optional DMG creation can be investigated separately; an unlocked graphical session with working Finder automation is a prerequisite, not a guarantee against the timeout.

| Symptom | What to do |
|---|---|
| `node`, `npm`, `pnpm`, or `cargo` not found | Finish the relevant install and open a new Terminal. For pnpm, repeat `export PATH="$HOME/.local/bin:$PATH"`; for Rust, run `source "$HOME/.cargo/env"`. Use `command -v pnpm` and the version commands above to find an older tool ahead of the intended one on PATH. |
| Missing script or `package.json` | Return to the repository root (`cd` into your `mynotes` clone), not `desktop/` or `deploy/`. Confirm `package.json` is present and you are on `main`. |
| `better-sqlite3` compilation fails, followed by missing `tsc`, `vitest`, or `tauri` | Follow the [desktop-only installation troubleshooting](#better-sqlite3-installation-failure-then-missing-desktop-tools). A failed install leaves local tools unavailable; do not install them globally or claim that web/Pi SQLite is fixed. |
| `zsh: command not found: #` | Follow the [pasted-command guidance](#zsh-command-not-found--when-pasting-commands); copy comment-free commands without Markdown fences or prompts. |
| pnpm reports a missing patch or frozen-lockfile failure | Preserve the tracked `patches/wouter@3.7.1.patch` file along with `package.json` and `pnpm-lock.yaml`. Use the complete clone, inspect `git status`, and safely update `main`; do not delete the patch or regenerate the lockfile to hide the error. Retry with pnpm 10.4.1. |
| A platform binary such as esbuild/Rollup is missing | Keep optional dependencies enabled; do not use `--no-optional`. Confirm the desktop-only install succeeded before proceeding. |
| Rust is too old | Run `rustup update stable`, then check `rustc --version` in the repository root. Inspect `rustup show` for an older override; select an appropriate stable toolchain without discarding your other project settings. The app needs at least Rust 1.90. |
| Desktop TypeScript or test failure | Stop and resolve the first useful error; do not ignore failures or remove checks. Only build after the checks succeed. |
| Missing compiler/SDK, wrong architecture, or app bundling failure | Finish Xcode tools installation and check `xcode-select -p`; compare Node architecture and Rust host. Re-run the recommended app-only build sequence from the root and capture the first relevant error. Do not treat a failed build as tested or ready for installation. |
| `bundle_dmg.sh`, `AppleEvent timed out. (-1712)`, or `Failed running AppleScript` | Follow the [DMG timeout guidance](#dmg-finderapplescript-timeout) and build with `--bundles app`. A DMG failure is installer packaging, not verified app runtime; preserve any existing vault. |
| Keychain or macOS launch warning | Stop and read the specific error. Follow the trusted-unnotarized-app guidance above only when it applies; do not bypass malware/damaged warnings or replace the credential store with insecure storage. Mac runtime behavior remains unverified. |

## References and verification

- [Recorded build/runtime verification and remaining limits](BUILD-RESULTS.md)
- [Desktop usage, security, recovery, and backup guide](README.md)
- [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/)
- [pnpm 10 install flags: development dependencies, lifecycle scripts, and optional dependencies](https://pnpm.io/10.x/cli/install)
- [pnpm 10 run: forwarding arguments to scripts](https://pnpm.io/10.x/cli/run)
- [Tauri 2 macOS application bundle (`--bundles app`)](https://v2.tauri.app/distribute/macos-application-bundle/)
- [Tauri 2 optional DMG distribution](https://v2.tauri.app/distribute/dmg/)
- [Official rustup installer](https://rustup.rs/)
- [Official Node.js downloads](https://nodejs.org/en/download)
- [Apple Xcode and Command Line Tools resources](https://developer.apple.com/xcode/resources/)
- [Apple: safely open apps on your Mac](https://support.apple.com/en-us/102445)

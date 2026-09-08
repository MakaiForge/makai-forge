# `app/_main/bootstrap/` — First-Run Bootstrap

The bootstrap module handles the initial setup flow: Python venv provisioning, resource downloads, setup splash window, and auto-update.

## Files

### `venv.ts` — Python Virtual Environment Setup

Downloads and restores a portable Python 3.10 venv from GitHub releases.

**Flow:**
1. `ensureVenv()` — entry point, checks if venv is valid
2. `checkVenv()` — validates: (a) `python3 --version` runs, (b) `aiohttp` and `ijson` are importable
3. If corrupted/missing, `restoreVenv()` downloads `venv-{platform}-arch.tar.gz` from mirrors
4. Downloads via `curl` from GitHub (`MakaiForge/venv`) → GitLab fallback
5. Extracts with `tar -xzf`, re-verifies, emits IPC progress to renderer

**Platform mapping:** `linux-x86_64`, `darwin-x86_64`, `darwin-aarch64`

**Signals:** `on-venv-progress` IPCEvent with `{status, percent}`

### `resource-manager.ts` — Resource Download & Verification

Downloads and verifies runtime resources from remote mirrors.

**Managed resources:**
- `bootstrap.tar.gz` — Bootstrap files
- `installer-api.tar.gz` — Installer API modules
- `proton_data.db.gz` — Proton database
- `fork_catalog.db.gz` — Fork catalog database
- `releases.tar.gz` — Release metadata

**Flow:**
1. Checks `bootstrap.json` for `auto_update` flag (default enabled)
2. `fetchMetadata()` downloads `resonance.json` from GitHub → GitLab mirrors
3. For each known resource, compares local version vs remote; downloads if outdated
4. SHA256 verification after download
5. Extracts (tar.gz → tar; .db.gz → gzip -d)
6. Persists version to `resonance.json` cache

**Fallback behavior:** If remote metadata unavailable, uses local resources if present.

### `setup-window.ts` — Setup Splash Window

Creates a dark-themed HTML splash screen shown during first-run bootstrap.

**Features:**
- Full-screen dark background with setup.png (brightness 0.3, gradient overlay)
- "MAKAI FORGE" title with purple gradient text
- Animated progress bar (gradient fill, 0.3s transition)
- Terminal-style log area with color-coded lines (info=blue, warn=yellow, error=red, success=green, download=purple, extract=light-purple)
- Listens for IPC events: `on-venv-progress`, `on-resource-progress`, `on-setup-complete`
- HTML generated inline and written to `userData/.cache/setup.html`

### `update-manager.ts` — Application Update Manager

**Stub implementation** — `checkForUpdates()` always returns `false`. Placeholder for future Electron `autoUpdater` integration.

### `autoupdater/` — Auto-Update IPC Events

| File | Description |
|------|-------------|
| `index.ts` | Imports/registers the two event handlers |
| `check-for-updates.ts` | Registers `checkForUpdates` IPC event → delegates to `UpdateManager.checkForUpdates()` |
| `restart-and-install-update.ts` | Registers `restartAndInstallUpdate` IPC event → calls `autoUpdater.quitAndInstall(false)` from `electron-updater`. Only runs when packaged. |

## Bootstrap Sequence

1. App launches → `createSetupWindow()` shows splash
2. `ensureVenv()` provisions Python venv (download if missing)
3. `ensureResources()` downloads/verifies/extracts databases and resources
4. `sendSetupComplete()` signals renderer → splash shows "Pronto!"
5. Main window loads

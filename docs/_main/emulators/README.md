# `app/_main/emulators/` — Emulator Engine

Manages discovery, installation, update, and launch of 31 emulators across 8 platform categories.

## Files

### `types.ts` — Type Definitions

Core interfaces:
- **`RunnerDefinition`** — Full emulator definition: `id`, `humanName`, `description`, `category`, `platforms`, `runnerType` (`standalone` | `libretro`), `libretroCoreId`, `repo` (GitHub owner/repo), `downloadUrl`, `executablePath`, `launchArgs`, `assetPattern`, `romSites`, `isAbandoned`, `isPaid`, `paidUrl`, `notes`
- **`RunnerStatus`** — Runtime state: `isInstalled`, `installedVersion`, `latestVersion`, `updateAvailable`, `installPath`
- **`RunnerCategory`** — Union: `nintendo` | `sony` | `sega` | `arcade` | `computers` | `microsoft` | `multi` | `obscure`
- **`RunnerRepo`** — GitHub `{owner, repo}`
- **`RomSite`** — ROM download source `{name, url, imageUrl}`

### `registry.ts` — Emulator Registry

Imports all 31 definitions and exports:
- `allRunnerDefinitions` — full array
- `getRunnerById(id)` — lookup by ID
- `getRunnersByCategory(category)` — filter by category

### `installer.ts` — Installation Engine

Handles the full lifecycle of emulator installation.

**Key functions:**
- `installRunner(def, onProgress, onStatus)` — Downloads + extracts + configures
- `uninstallRunner(id)` — Removes runner directory
- `launchGame(runnerId, romPath, onExit)` — Spawns emulator with ROM, tracks processes
- `closeRunner(runnerId)` — Kills running emulator process (SIGTERM → SIGKILL)
- `isInstalled(runnerId)` / `getInstalledVersions()` — Query installed state
- `getRunnerStatus(def)` — Returns full status with version

**Download sources** (in order):
1. `definition.downloadUrl` — direct URL
2. `definition.repo` — GitHub releases: fetches latest tag via HEAD redirect, scrapes expanded_assets HTML for download links
3. `definition.isPaid` — Throws error with purchase URL
4. `definition.isAbandoned` — Throws error with manual install note

**Extraction support:** `.tar.gz`, `.tgz`, `.tar.xz`, `.txz`, `.zip`, `.deb`, `.AppImage`, `.desktop`

**Special handling:**
- **Libretro cores** — Downloads RetroArch AppImage, places core `.so` in `cores/`, creates `launcher.sh` wrapper
- **Deb extraction** — Uses `ar x` → reads `data.tar.*`, extracts with correct strip
- **Flatten** — If extraction creates single subdirectory, moves contents up

### `updater.ts` — Update Checking

- `checkForRunnerUpdates(runnerId?)` — Queries GitHub API `/releases/latest` for each installed runner, compares tags
- `hasUpdatesAvailable()` — Boolean check
- `shouldCheckForUpdates()` — 24h cooldown (persisted to `runners/.last-update-check`)

## Definitions by Category

### Nintendo (10)
`bsnes`, `cemu` (Wii U), `dolphin` (GameCube/Wii), `melonds` (DS), `mesen` (NES/SNES), `mgba` (GBA), `mupen64plus` (N64), `ryujinx` (Switch), `snes9x` (SNES), `zsnes` (SNES)

### Sony (5)
`duckstation` (PS1), `pcsx2` (PS2), `ppsspp` (PSP), `rpcs3` (PS3), `vita3k` (PS Vita)

### Sega (3)
`blastem` (Genesis/Mega Drive), `flycast` (Dreamcast/Naomi), `genesis-plus-gx` (Master System/Genesis/Game Gear)

### Arcade (1)
`mame` (Multi Arcade Machine Emulator)

### Computers (5)
`atari800` (Atari 8-bit), `dosbox-staging` (DOS), `hatari` (Atari ST), `scummvm` (Point-and-click adventure), `stella` (Atari 2600)

### Microsoft (1)
`xemu` (Original Xbox)

### Multi (1)
`mednafen` (Multi-system emulator)

### Obscure (5)
`fs-uae` (Amiga), `nekop2` (Neko Project II — PC-98), `quasi88` (PC-8801), `tic80` (TIC-80 fantasy console), `vice` (Commodore 64/128/VIC-20)

**Total: 31 emulator definitions**

### `index.ts` — Public API
Re-exports all functions and types from registry, installer, and updater.

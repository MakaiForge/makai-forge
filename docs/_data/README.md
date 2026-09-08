# `app/_data/` — Databases & Data Files

## Relational Databases

| File | Size | Description |
|------|------|-------------|
| `proton_data.db` | ~281 MB | Main Proton compatibility database. Stores game compatibility info, known working configurations, per-game Proton recommendations, DXVK/VKD3D settings. |
| `fork_catalog.db` | ~4.9 MB | Fork catalog database. Indexes 30+ Proton/Wine forks with metadata: repo URL, latest version, features (Wayland/HDR/DLSS/Fsync/EAC/BattleEye/etc.), and per-fork game match data. |
| `supplemental.db` | ~50 MB | Supplemental data — additional compatibility info, user-submitted reports, or extended game metadata beyond `proton_data.db`. |

## JSON Data Files

| File | Description |
|------|-------------|
| `resonance.json` | Remote resource metadata manifest (65 lines). Maps resource names (`bootstrap.tar.gz`, `installer-api.tar.gz`, `catalogo.db.gz`, `proton_data.db.gz`, `fork_catalog.db.gz`) to version, sha256, size, and mirror URLs on GitHub (`MakaiForge/the-bootstrap`) and GitLab. Used by `resource-manager.ts` to download/verify resources. |
| `exchange-rates.json` | Currency exchange rates (single line, massive JSON). Rates against USD for ~170 currencies. Used for price conversion in catalog browsing. |

## Subdirectories

### `catalogs/` — Fork Analysis & Game Compatibility

| File | Purpose |
|------|---------|
| `fork-analysis.json` | Per-fork analysis: total releases, stable releases, matched games, feature matrix (wayland, hdr, dlss, framegen, fsync, esync, eac, battleye, arm64, vr, vkd3d) |
| `game-forks-all-raw.json` | Raw fork-game association data |
| `game-forks-compat.json` | Filtered compatibility data |
| `game-forks-compat-enriched.json` | Enriched with additional analysis |
| `game-forks-unmatched.json` | Games not matched to any fork |
| `game-mentions-raw.json` | Raw mentions data from forum/wiki scraping |

### `games-data/` — Per-Game Data

Thousands of JSON files (12,200+), one per internal game ID (e.g., `1P08R.json`, `2v0p6.json`). Contains game-specific metadata for the catalog. File names are base62-encoded IDs.

### `price-cache/` — Price Cache

61 JSON files, one per Steam AppID (e.g., `730.json` for CS:GO, `578080.json` for PUBG, `271590.json` for GTA V). Stores cached price data to avoid hitting external APIs repeatedly.

### `releases/` — Release Metadata

36 JSON files tracking releases of Proton/Wine forks and tools:

| Category | Files |
|----------|-------|
| **Valve/UMU** | `valve-proton.json`, `valve.json`, `umu-proton.json` |
| **Community Protons** | `proton-ge.json`, `proton-cachyos.json`, `proton-em.json`, `proton-tkg.json`, `proton-lfx2.json`, `proton-lina.json`, `proton-ove-mc.json`, `proton-plop.json`, `proton-sarek.json`, `proton-speedhack.json` |
| **Wine Builds** | `wine-staging.json`, `wine-staging-tkg.json`, `wine-staging-amd.json`, `wine-tkg.json`, `wine-vanilla.json`, `wine-proton-kron4ek.json`, `wine-miniloader.json` |
| **Specialized** | `boxtron.json`, `dw-proton.json`, `gwine.json`, `luxtorpeda.json`, `proton-ge-miniloader.json`, `proton-ge-rtsp.json`, `proton-wine-andrevto.json`, `proton-wine-gamenative.json`, `roberta.json`, `steam-tinker-launch.json` |
| **DXVK/VKD3D** | `dxvk.json`, `dxvk-gplasync.json`, `dxvk-sarek.json`, `vkd3d-proton.json`, `vkd3d-lutris.json` |
| **Discovery** | `_discovered_forks.json` — 93 auto-discovered fork repos from GitHub |

### `.chrome-profiles/` — Chrome User Profiles

Stores Chromium embedded browser session data. Contains `profile-1783515484495/` — one profile directory per user session.

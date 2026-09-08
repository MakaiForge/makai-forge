# `app/_resources/` — Runtime Binaries & Assets

Directory with runtime binaries shipped with the app (~381 MB for Chrome alone).

## `binaries/` — Tools

| Entry | Type | Description |
|-------|------|-------------|
| `7z/7zz` | Binary | 7-Zip standalone (p7zip) — archive extraction |
| `7z.dll`/`7z.exe` | Binary | 7-Zip Windows DLL/exe for Wine-side extraction |
| `7zzs` | Binary | 7-Zip standalone (static build, no deps) |
| `cabextract/cabextract` | Binary | Microsoft CAB archive extractor |
| `ludusavi/ludusavi` | Binary | Save game backup/restore tool (`config.yaml` with manifests disabled) |
| `Makaitricks` | Binary | Makai Forge's winetricks replacement — prefix setup scripts |
| `qbittorrent/qbittorrent-nox` | Binary | Headless qBittorrent daemon for torrent downloads |
| `qbittorrent/qbittorrent.zip` | Archive | Full qBittorrent bundle |
| `torrent-tracker-list.txt` | Text | List of BitTorrent trackers for torrent RPC |
| `umu-run` | Binary | UMU compatibility runner (launches Proton) |

## `chrome/` — Embedded Chromium

- `chrome-linux64/` — Full Chromium browser (~381 MB) used by the Electron `browser-view` for in-app web content.

## `extensions/` — Chrome Extensions

| Extension | Description |
|-----------|-------------|
| `mjnbclmflcpookeapghfhapeffmpodij/` | **UltraSurf VPN** (v1.9.2) — Encrypted proxy/VPN extension for secure browsing. Manifest v3, service worker background. |
| `ultrasurf/ultrasurf.crx` | UltraSurf VPN packaged CRX (same extension) |
| `ultra-welcome/` | **UltraWelcome** — Content script injects welcome popups on mod websites (NexusMods, GameBanana, ModDB, CurseForge, mod.io, Thunderstore, itch.io, LoversLab) |

## `native/` — Rust Native Addon

- `protonforge-native.node` — Compiled NAPI native module
- `protonforge-native/` — Rust source (Cargo.toml, build.rs, src/lib.rs)

**Exported functions** (`@napi-rs`):
- `processProfileImage(path, targetExtension?)` — Detects animated images (GIF/WebP/APNG), converts to target format (png/jpg/webp). Uses `image` crate.
- `listProcesses()` — Lists all system processes with PID, name, exe path, cwd, env vars. Uses `sysinfo` crate. Sorted by PID.

## `python/` — Python Scripts

| Script | Description |
|--------|-------------|
| `wine_log.py` | Headless Wine log capture. Usage: `wine_log.py --logfile <path> <command> [args]`. Spawns command, captures stdout+stderr to logfile, survives parent death (`start_new_session=True`). |
| `wine_log_gui.py` | Tkinter GUI Wine log viewer (~203 lines). Two modes: spawn a command and show output live, or `--tail <file>` to tail a log file. Dark theme. Avoids threading to prevent XInitThreads xcb crashes on Linux. |

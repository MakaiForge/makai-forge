# `app/_main/torrent-rpc/` — STDIO JSON-RPC Torrent Bridge

A Python-based STDIO JSON-RPC bridge that connects the Electron renderer to a headless qBittorrent daemon for game downloading via BitTorrent.

## Architecture

```
Electron (renderer) ←→ Electron (main) ←→ STDIO ←→ Python RPC ←→ qBittorrent Web API ←→ qBittorrent-nox
```

The Python process is spawned by Electron as a subprocess, communicating via newline-delimited JSON over stdin/stdout. Each request is handled in a daemon thread.

## Files

### `main.py` — STDIO JSON-RPC Server (445 lines)

Entry point. Parses CLI args: `main.py <torrent_port> [rpc_password] <start_download_payload> <start_seeding_payload>`

**Protocol:**
- On startup, writes `{"event": "ready", "protocolVersion": 1}` to stdout
- Reads JSON lines from stdin, dispatches each to a daemon thread
- Each request: `{"id": ..., "method": "...", "params": {...}, "rpc_password": "..."}`
- Response: `{"id": ..., "result": ...}` or `{"id": ..., "error": {"code": ..., "message": ...}}`

**Supported RPC methods:**

| Method | Params | Description |
|--------|--------|-------------|
| `status` | none | Returns download progress for current game |
| `seed_status` | none | Returns list of seeding torrents |
| `action` | `{action, game_id, url?, save_path?}` | Actions: `start`, `pause`, `cancel`, `resume_seeding`, `pause_seeding`, `set_download_limit` |

**Security:**
- Optional HMAC-based password validation
- Magnet URI validation: must start with `magnet:`, max 8192 chars, valid `urn:btih:` hash (hex 40 or base32 32)
- Torrent files cache: 300s TTL, max 128 items

**qBittorrent state mapping:** Maps qBittorrent states (`metaDL`, `downloading`, `seeding`, `pausedDL`, etc.) to libtorrent-style numeric status codes.

**Bootstrap:** On startup, reads initial download payload from CLI args and auto-starts the torrent.

### `qbittorrent_client.py` — qBittorrent Web API Client (90 lines)

Lightweight HTTP client for qBittorrent's Web UI API (v2 endpoints).

**Endpoints used:**
- `GET /torrents/info` — List torrents
- `GET /torrents/info?hash=...` — Get specific torrent
- `POST /torrents/add` — Add magnet link with save path
- `POST /torrents/pause?hashes=...` — Pause torrent
- `POST /torrents/resume?hashes=...` — Resume torrent
- `POST /torrents/delete` — Delete torrent
- `GET /torrents/files?hash=...` — List torrent files

**Error handling:** 3 retries with 1s delay on connection errors (ECONNREFUSED). Logs errors via `protonforge.qbittorrent` logger.

### `setup.py` — Build Script (cx_Freeze)

Compiles `main.py` into a standalone Windows executable (`protonforge-python-rpc.exe`). Includes OpenSSL DLLs (`libcrypto-1_1.dll`, `libssl-1_1.dll`) for Windows builds.

### `requirements.txt`

Standard Python dependencies for the venv:
```
aiohttp>=3.8,<4
yarl>=1.9,<2
multidict>=6,<7
frozenlist>=1,<2
aiosignal>=1,<2
attrs>=23,<25
```

### `torrent_downloader.py.bak`

Backup of a previous downloader implementation.

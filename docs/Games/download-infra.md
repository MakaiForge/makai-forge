# Download Infrastructure

> Sistemas auxiliares de download: gerenciamento de fontes, torrenting, 9 APIs
> de file hosters, e integrações Debrid (RD, PM, AD, TB).

---

## Mapa Mental

```
DOWNLOAD INFRASTRUCTURE
│
├── DOWNLOAD SOURCES (Fontes de Repack)
│   ├── Armazenamento: sourcesDb → downloadSourcesStore
│     ├── Add: addDownloadSource(url) → valida duplicata + uuid
│     ├── Sync: syncDownloadSources() → lê JSON de data/sources/
│     ├── Match: local-sources-handler.ts → fuzzy match por título/steamId
│     └── Check: download-sources-checker.ts → badges "new options"
│
├── TORRENTING
│     ├── DownloadManager → QBittorrentBackend (WebUI em localhost:8080)
│     ├── Queue: addGameToQueue (paused + queued), reorder
│     ├── Status: active, waiting, paused, error, complete, seeding, extracting
│     ├── Trackers: appends de torrent-tracker-list.txt a magnets
│     ├── Seed: pauseSeed / resumeSeed com status "seeding" e "complete"
│     └── Torrent Files: Python RPC → torrent_files(magnet) → lista de arquivos
│
├── FILE HOSTERS (9 APIs)
│     ├── Gofile → guest token, contents recurse, direct URL
│     ├── PixelDrain → bypass CDN (cdn.pixeldrain.eu.cc)
│     ├── Mediafire → parse HTML, regex direct URL
│     ├── Datanodes → POST FormData, parse JSON
│     ├── Buzzheavier → HEAD /download, hx-redirect header
│     ├── FuckingFast → parse HTML, window.open() extract
│     ├── VikingFile → POST Nimbus API, follow redirect
│     └── Rootz → GET /api/files/download-by-short/{id}
│
└── DEBRID (TODO — stubs)
      ├── Real-Debrid → token em UserPreferences (sem UI)
      ├── Premiumize → token em UserPreferences (sem UI)
      ├── AllDebrid → token em UserPreferences (sem UI)
      ├── TorBox → token em UserPreferences (sem UI)
      ├── ProtonDebridClient → STUB (sempre null)
      └── ProtonForgeDebridClient → funcional (via API /debrid/)
```

---

## Download Sources

### Armazenamento
```
sourcesDb (userData/stores/sources/)
  ├── downloadSourcesStore     → DownloadSource[]
  ├── downloadSourcesCheckBaseline → timestamp string
  └── downloadSourcesSinceValue    → timestamp string
```

### IPC

| Canal | Handler | Função |
|-------|---------|--------|
| `addDownloadSource` | `events/download-sources/add-download-source.ts` | Adicionar URL (valida duplicata) |
| `removeDownloadSource` | `events/download-sources/remove-download-source.ts` | Remover por ID ou all |
| `getDownloadSources` | `events/download-sources/get-download-sources.ts` | Listar todas (ordenado por createdAt) |
| `syncDownloadSources` | `events/download-sources/sync-download-sources.ts` | Sincronizar com JSON locais |
| `getDownloadSourcesCheckBaseline` | `events/download-sources/get-download-sources-check-baseline.ts` | Timestamp de última verificação |
| `getDownloadSourcesSinceValue` | `events/download-sources/get-download-sources-since-value.ts` | Valor "since" para API |

### Flow
```
Add URL → addDownloadSource → Armazenamento
Sync → handleGetDownloadSources() → lê data/sources/*.json → escreve no armazenamento
Match game → handleGetGameDownloadSources() → fuzzy match por título/steamId → GameRepack[]
Check badges → DownloadSourcesChecker.checkForChanges() → on-new-download-options
```

### Settings UI
- `SettingsDownloadSources` → lista com status badge, remove, sync
- `AddDownloadSourceModal` → form com yup validation
- Auto-polls a cada 5s para sources em `Matching`/`PendingMatching`

---

## Torrenting

### IPC

| Canal | Handler | Função |
|-------|---------|--------|
| `startGameDownload` | `events/torrenting/start-game-download.ts` | Iniciar download (pausa ativo, cancela existente, append trackers) |
| `addGameToQueue` | `events/torrenting/add-game-to-queue.ts` | Adicionar à fila (paused + queued) |
| `pauseGameDownload` | `events/torrenting/pause-game-download.ts` | Pausar |
| `resumeGameDownload` | `events/torrenting/resume-game-download.ts` | Retomar (pausa outros ativos) |
| `cancelGameDownload` | `events/torrenting/cancel-game-download.ts` | Cancelar + limpar |
| `pauseGameSeed` | `events/torrenting/pause-game-seed.ts` | Parar seed |
| `resumeGameSeed` | `events/torrenting/resume-game-seed.ts` | Retomar seed |
| `checkDebridAvailability` | `events/torrenting/check-debrid-availability.ts` | Verificar disponibilidade debrid (stub) |
| `getTorrentFiles` | `events/torrenting/get-torrent-files.ts` | Listar arquivos do torrent (RPC Python) |
| `updateDownloadQueuePosition` | `events/torrenting/update-download-queue-position.ts` | Reordenar fila |

### Download Flow
```
startGameDownload
  → Pausa download ativo
  → Cancela download existente do mesmo jogo
  → Append trackers de torrent-tracker-list.txt à magnet URI
  → Cria Download { status: "active" }
  → DownloadManager.startDownload(download)
    ├── Se Downloader.Torrent:
    │     → QBittorrentBackend.startDownload(gameId, magnet, savePath)
    │       → QBittorrentClient.login() (cookie SID)
    │       → QBittorrentClient.addMagnet(magnet, savePath)
    │       → Store qbHash
    └── Se HTTP:
          → JsHttpDownloader.startDownload(options)
```

### DownloadManager (src/main/services/download/index.ts)
```
Métodos principais:
  startDownload(download)      → roteia para backend correto
  pauseDownload(shop, objectId) → delega
  resumeDownload(shop, objectId)
  cancelDownload(shop, objectId)
  resumeSeeding(shop, objectId)
  pauseSeeding(shop, objectId)
  hasActiveDownload()          → usado pelo power save blocker
```

### Status
```
"active" | "waiting" | "paused" | "error" | "complete" | "seeding" | "removed" | "extracting"
```

---

## File Hosters

### APIs (src/main/services/hosters/)

| Hoster | Classe | Método principal |
|--------|--------|------------------|
| **Gofile** | `GofileApi` | `getDownloadLink(id, password?)` — guest token, contents recurse |
| **PixelDrain** | `PixelDrainApi` | `unlock(url)` — CDN bypass |
| **Mediafire** | `MediafireApi` | `getDownloadUrl(url)` — parse HTML, regex |
| **Datanodes** | `DatanodesApi` | `getDownloadUrl(url)` — POST FormData |
| **Buzzheavier** | `BuzzheavierApi` | `getDirectLink(url)` — HEAD /download |
| **FuckingFast** | `FuckingFastApi` | `getDirectLink(url)` — parse window.open() |
| **VikingFile** | `VikingFileApi` | `getDownloadUrl(uri)` — POST Nimbus API |
| **Rootz** | `RootzApi` | `getDownloadUrl(uri)` — GET /api/files/download-by-short/{id} |

### Download Options (src/main/services/download/options/)

Cada option file:
1. Chama a hoster API → direct URL
2. Resolve filename via `resolveFilename()`
3. Chama `buildDownloadOptions(url, savePath, filename, headers?)` → `DownloadOptions`

| Option File | Hoster | Headers especiais |
|-------------|--------|-------------------|
| `gofile.ts` | Gofile | `Cookie: accountToken=${token}` |
| `pixel-drain.ts` | PixelDrain | — |
| `datanodes.ts` | Datanodes | — |
| `buzzheavier.ts` | Buzzheavier | — |
| `fucking-fast.ts` | FuckingFast | — |
| `mediafire.ts` | Mediafire | — |
| `viking-file.ts` | VikingFile | — |
| `rootz.ts` | Rootz | — |
| `proton.ts` | ProtonDebridClient | **STUB** |
| `protonforge.ts` | ProtonForgeDebridClient | API key |

---

## Debrid Integrations

### Status: ⚠️ PARCIALMENTE IMPLEMENTADO

| Serviço | Token em UserPreferences | UI Settings | Client funcional |
|---------|------------------------|-------------|------------------|
| Real-Debrid | ✅ `realDebridApiToken` | ❌ (só texto descritivo) | ❌ (stub) |
| Premiumize | ✅ `premiumizeApiToken` | ❌ | ❌ (stub) |
| AllDebrid | ✅ `allDebridApiToken` | ❌ | ❌ (stub) |
| TorBox | ✅ `torBoxApiToken` | ❌ | ❌ (stub) |
| ProtonForge Debrid | — | — | ✅ funcional |

### ProtonForgeDebridClient (funcional)
```
POST /debrid/check-availability → verifica magnets
POST /debrid/request-file → solicita download
```

### Settings UI
- `settings-debrid.tsx` → só texto descritivo (sem inputs de token)
- `settings-context-integrations.tsx` → wrapper com título "Debrid Services"
- `debrid-badge.tsx` → componente decorativo (ícone Meteor)

---

## Preload Bindings

| Binding | Evento |
|---------|--------|
| `window.electron.addDownloadSource(url)` | `addDownloadSource` |
| `window.electron.removeDownloadSource(id, removeAll)` | `removeDownloadSource` |
| `window.electron.getDownloadSources()` | `getDownloadSources` |
| `window.electron.syncDownloadSources()` | `syncDownloadSources` |
| `window.electron.startGameDownload(payload)` | `startGameDownload` |
| `window.electron.addGameToQueue(payload)` | `addGameToQueue` |
| `window.electron.pauseGameDownload(shop, objectId)` | `pauseGameDownload` |
| `window.electron.resumeGameDownload(shop, objectId)` | `resumeGameDownload` |
| `window.electron.cancelGameDownload(shop, objectId)` | `cancelGameDownload` |
| `window.electron.pauseGameSeed(shop, objectId)` | `pauseGameSeed` |
| `window.electron.resumeGameSeed(shop, objectId)` | `resumeGameSeed` |
| `window.electron.getTorrentFiles(magnet)` | `getTorrentFiles` |
| `window.electron.updateDownloadQueuePosition(shop, objectId, direction)` | `updateDownloadQueuePosition` |

---

## Arquivos Envolvidos

| Área | Caminho |
|------|---------|
| **Download Sources** | `src/main/events/download-sources/` (6 handlers), `src/main/services/local-sources-handler.ts`, `services/download-sources-checker.ts` |
| **Sources UI** | `src/renderer/src/pages/settings/settings-download-sources.tsx`, `add-download-source-modal.tsx` |
| **Torrenting** | `src/main/events/torrenting/` (10 handlers), `services/download/qbittorrent-backend.ts`, `services/download/torrent-backend.ts` |
| **DownloadManager** | `src/main/services/download/index.ts` (facade central) |
| **Download subservices** | `services/download/status/`, `payload/`, `completion/`, `seed/`, `queue/`, `url/` |
| **File Hosters** | `src/main/services/hosters/` (9 APIs), `services/download/options/` (11 option files) |
| **Debrid** | `src/types/level.types.ts` (tokens), `services/download/proton-debrid.ts` (stub), `services/download/protonforge-debrid.ts` (funcional) |
| **Debrid UI** | `src/renderer/src/pages/settings/settings-debrid.tsx`, `components/debrid-badge/` |
| **Types** | `src/types/download.types.ts`, `src/shared/constants.ts` (Downloader enum) |
| **Armazenamento** | `src/main/store/databases/sources.ts`, `sublevels/download-sources.ts` |

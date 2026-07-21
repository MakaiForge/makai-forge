# Arquitetura do DownloadManager Modularizado

## Visão Geral - Árvore de Arquivos

```
download-manager/
├── index.ts                          # Fachada principal (API Pública)
├── types.ts                          # Interfaces e tipos
├── helpers.ts                        # Funções utilitárias (calculateETA, getDirSize)
│
├── url/
│   ├── index.ts                      # Exports do módulo url
│   ├── extract.ts                    # extractFilename()
│   ├── sanitize.ts                   # sanitizeFilename(), sanitizeRelativePath()
│   ├── resolve.ts                    # resolveFilename(), buildDownloadOptions()
│   ├── gofile.ts                     # parseGofileUri()
│   └── payload.ts                    # createDownloadPayload()
│
├── options/                          # Opções de download por provedor
│   ├── index.ts                      # getJsDownloadOptions() - Router
│   ├── gofile.ts                     # getGofileDownloadOptions()
│   ├── pixel-drain.ts                # getPixelDrainDownloadOptions()
│   ├── datanodes.ts                  # getDatanodesDownloadOptions()
│   ├── buzzheavier.ts                # getBuzzheavierDownloadOptions()
│   ├── fucking-fast.ts               # getFuckingFastDownloadOptions()
│   ├── mediafire.ts                  # getMediafireDownloadOptions()
│   ├── real-debrid.ts                # getRealDebridDownloadOptions()
│   ├── premiumize.ts                 # getPremiumizeDownloadOptions()
│   ├── all-debrid.ts                 # getAllDebridDownloadOptions()
│   ├── torbox.ts                     # getTorBoxDownloadOptions()
│   ├── protonforge.ts                      # getProtonForgeDownloadOptions()
│   ├── viking-file.ts                # getVikingFileDownloadOptions()
│   └── rootz.ts                      # getRootzDownloadOptions()
│
├── payload/                          # Payloads para RPC/libtorrent
│   ├── index.ts                      # getDownloadPayload() - Router
│   ├── http.ts                       # Payloads para downloads HTTP
│   └── torrent.ts                    # Payload para torrent
│
├── status/
│   ├── index.ts                      # getDownloadStatus() - Router
│   ├── js-status.ts                  # getDownloadStatusFromJs()
│   ├── rpc-status.ts                 # getDownloadStatusFromRpc()
│   └── watcher.ts                    # watchDownloads()
│
├── speed-limit/
│   ├── index.ts                      # applyDownloadSpeedLimit()
│   └── normalize.ts                  # normalizeDownloadSpeedLimit()
│
├── completion/
│   ├── index.ts                      # handleDownloadCompletion()
│   ├── update-status.ts              # updateDownloadStatus()
│   ├── ui-update.ts                  # sendProgressUpdate()
│   └── extraction.ts                 # handleExtraction()
│
├── seed/
│   ├── index.ts                      # Seed manager main
│   ├── resume.ts                      # resumeSeeding()
│   ├── pause.ts                      # pauseSeeding()
│   └── status.ts                     # getSeedStatus()
│
├── batch/
│   ├── index.ts                      # runAllDebridBatch()
│   ├── progress.ts                   # calculateAllDebridBatchProgress()
│   └── cleanup.ts                    # cleanupBatch()
│
└── queue/
    └── index.ts                      # processNextQueuedDownload()
```

## Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              index.ts                                       │
│                         DownloadManager (Facade)                            │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
        ▼                        ▼                        ▼
┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
│   url/index.ts    │  │  options/index.ts │  │  payload/index.ts │
│   - extract       │  │  - getJsDownload  │  │  - getDownload    │
│   - sanitize      │  │    Options()      │  │    Payload()      │
│   - resolve       │  │                    │  │                   │
└───────────────────┘  └────────┬──────────┘  └─────────────────────┘
                                 │                        │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
        ▼                        ▼                        ▼
┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
│ status/index.ts   │  │ speed-limit/      │  │  batch/index.ts   │
│ - getDownload     │  │   index.ts        │  │  - runAllDebrid   │
│   Status()        │  │ - applyDownload   │  │    Batch()        │
│ - watchDownloads()│  │   SpeedLimit()    │  │  - calculateBatch │
│                   │  │                   │  │    Progress()     │
└───────────────────┘  └───────────────────┘  └─────────────────────┘
        │                        │                        │
        └────────────────────────┼────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
        ▼                        ▼                        ▼
┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
│ completion/      │  │    seed/index.ts  │  │   queue/index.ts │
│   index.ts       │  │  - resumeSeeding  │  │ - processNext     │
│ - handleDownload │  │  - pauseSeeding   │  │   QueuedDownload()│
│   Completion()   │  │  - getSeedStatus()│  │                   │
│ - handleExtract  │  │                   │  │
└───────────────────┘  └───────────────────┘  └───────────────────┘
```

## Responsabilidades por Módulo

### `url/` - Manipulação de URLs e Arquivos
- **extract.ts**: Extrai filename de URLs
- **sanitize.ts**: Remove caracteres inválidos de filenames/paths
- **resolve.ts**: Resolve filename para resuming
- **gofile.ts**: Parsing específico do Gofile
- **payload.ts**: Criação de payload padronizado

### `options/` - Opções por Provedor
Cada arquivo contém a lógica específica para obter URL direta de cada provedor:
- `gofile.ts`, `pixel-drain.ts`, `datanodes.ts`, `buzzheavier.ts`
- `fucking-fast.ts`, `mediafire.ts`, `real-debrid.ts`, `premiumize.ts`
- `all-debrid.ts`, `torbox.ts`, `protonforge.ts`, `viking-file.ts`, `rootz.ts`

### `payload/` - Geração de Payloads RPC
- **http.ts**: Payloads para downloads HTTP via PythonRPC
- **torrent.ts**: Payload específico para torrent

### `status/` - Monitoramento
- **js-status.ts**: Status do JsHttpDownloader
- **rpc-status.py**: Status do PythonRPC/libtorrent
- **watcher.ts**: Loop de monitoramento

### `completion/` - Conclusão
- **update-status.ts**: Atualiza status no banco
- **ui-update.ts**: Notifica UI (progress bar, IPC)
- **extraction.ts**: Extração automática de arquivos

### `seed/` - Gerenciamento de Seeding
- **resume.ts**: Inicia seeding
- **pause.ts**: Pausa seeding
- **status.ts**: Verifica integridade dos seeds

### `batch/` - Downloads em Lote
- **progress.ts**: Calcula progresso total do batch
- **cleanup.ts**: Limpa estado em caso de erro

## Dependências Externas

```
download-manager/
├── @shared (Downloader, DownloadError, FILE_EXTENSIONS_TO_EXTRACT)
├── @types (Download, DownloadProgress, Game, UserPreferences)
├── @main/store (db, downloadsSublevel, gamesSublevel, levelKeys)
├── @main/events/helpers/get-directory-size (getDirectorySize)
├── @main/services/hosters (BuzzheavierApi, FuckingFastApi)
├── ../window-manager (WindowManager)
├── ../notifications (publishDownloadCompleteNotification)
├── ../hosters (GofileApi, DatanodesApi, MediafireApi, etc)
├── ../python-rpc (PythonRPC)
├── ../game-files-manager (GameFilesManager)
├── ./real-debrid (RealDebridClient)
├── ./torbox (TorBoxClient)
├── ./proton-debrid (ProtonDebridClient)
├── ./premiumize (PremiumizeClient)
├── ./all-debrid (AllDebridClient)
├── ./js-http-downloader (JsHttpDownloader)
├── ./qbittorrent-backend (QBittorrentBackend)
└── ./torrent-backend (TorrentBackend interface)
```

## Estatísticas

| Módulo | Arquivos | Linhas Médias/Arquivo |
|--------|----------|----------------------|
| url/ | 6 | ~30 |
| options/ | 14 | ~25 |
| payload/ | 3 | ~80 |
| status/ | 4 | ~70 |
| speed-limit/ | 2 | ~25 |
| completion/ | 4 | ~50 |
| seed/ | 4 | ~25 |
| batch/ | 3 | ~40 |
| queue/ | 1 | ~30 |
| **Total** | **~45** | **~35** |
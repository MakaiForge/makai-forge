# Árvore Genealógica — Quem Chama Quem

> Mapa de todas as chamadas entre componentes, do clique inicial ao jogo na aba Games.

---

## 1. Árvore de Início de Download

```
usuário clica "Download" no catálogo/game-details
│
└── React: startGameDownload(payload)
    │
    └── IPC: window.electron.startGameDownload(payload)
        │
        └── Main: start-game-download.ts :: startGameDownload()
            │
            ├── DownloadManager.pauseDownload()
            │   ├── [HTTP] JsHttpDownloader.pauseDownload()
            │   └── [Torrent] QBittorrentBackend.pause()
            │       └── QBittorrentClient.stop(hash)
            │           └── POST /api/v2/torrents/stop
            │
            ├── prepareGameEntry()
            │   └── gamesStore.get(gameKey) → cria se não existe
            │
            ├── DownloadManager.cancelDownload(gameKey)
            │   ├── [HTTP] JsHttpDownloader.cancelDownload()
            │   └── [Torrent] QBittorrentBackend.cancel()
            │       └── QBittorrentClient.delete(hash, false)
            │           └── POST /api/v2/torrents/delete
            │
            ├── normalizeDownloadUri(uri)
            ├── appendTrackersToMagnet(uri, getTrackers())
            │
            ├── downloadsStore.put(gameKey, download)
            ├── gamesStore.put(gameKey, { downloadUrl, downloader })
            │
            └── DownloadManager.startDownload(download)
                │
                ├── [HTTP]
                │   ├── getJsDownloadOptions(download)
                │   ├── new JsHttpDownloader()
                │   └── jsDownloader.startDownload(options)
                │
                └── [Torrent]
                    └── QBittorrentBackend.startDownload()
                        ├── QBittorrentClient.login()
                        │   └── POST /api/v2/auth/login
                        ├── QBittorrentClient.addMagnet()
                        │   └── POST /api/v2/torrents/add
                        └── downloadsStore.put(gameKey, { qbHash })
```

---

## 2. Árvore de Monitoramento (Polling)

```
main-loop.ts (a cada 2s)
│
└── DownloadManager.watchDownloads()
    │
    ├── getDownloadStatus()
    │   ├── [HTTP] getDownloadStatusFromJs()
    │   └── [Torrent] QBittorrentBackend.getStatus()
    │       └── QBittorrentClient.getTorrents()
    │           └── GET /api/v2/torrents/info
    │
    ├── sendProgressUpdate()
    │   └── mainWindow.webContents.send("on-download-progress", ...)
    │
    └── [Se progress === 1]
        └── handleDownloadCompletion()
            │
            ├── publishDownloadCompleteNotification()
            ├── updateDownloadStatus()
            │   └── downloadsStore.put(gameKey, { status: "complete"|"seeding" })
            │
            ├── handleExtraction()
            │   └── GameFilesManager.extractDownloadedFile()
            │       ├── SevenZip.extractFile()
            │       ├── extractFilesInDirectory()
            │       ├── setExtractionComplete()
            │       │   └── mainWindow.webContents.send("on-extraction-complete")
            │       └── searchAndBindExecutable()
            │
            └── processNextQueuedDownload()
```

---

## 3. Árvore do Botão "Instalar"

```
usuário clica "Instalar" em download concluído
│
└── React: handleOpenGameInstaller(shop, objectId)
    │
    ├── window.electron.getInstalledProtonVersions()
    │   └── Main: Umu.getInstalledProtonVersions()
    │       └── Escaneia: ~/.steam/steam/steamapps/common/Proton*
    │
    └── setShowRecommendationModal(true)
        │
        └── ProtonRecommendationModal
            │
            ├── [Usuário seleciona Proton instalado]
            │   └── handleSelectProton(protonPath)
            │       └── window.electron.openGameInstaller(shop, objectId, protonPath)
            │
            └── [Usuário clica "Baixar"]
                └── handleDownloadAndSelect(fork)
                    ├── window.electron.downloadProton(fork)
                    │   ├── findToolIdByForkName(fork)
                    │   ├── getReleases(toolId)
                    │   └── downloadTool({ toolId, release })
                    │       ├── downloadFile(url, dest)
                    │       └── extractArchive(archive)
                    │
                    └── window.electron.openGameInstaller(shop, objectId, protonPath)
```

---

## 4. Árvore de openGameInstaller()

```
window.electron.openGameInstaller(shop, objectId, protonPath)
│
└── Main: open-game-installer.ts :: openGameInstaller()
    │
    ├── Wine.getEffectivePrefixPath()
    │
    ├── setupPrefix(gameId, protonPath, prefixPath)
    │   └── spawn umu-run wineboot -u
    │
    ├── [Se winetricks/gameDlls]:
    │   ├── ensureWinetricks()
    │   └── ProtonRecommendationService.installGameDlls()
    │
    ├── findGameFolder(gameTitle)
    │
    ├── [Se arquivo .exe/.msi]:
    │   └── installGame(gamePath, options)
    │       │
    │       ├── [Modo RESTORE]:
    │       │   ├── MakaiRPC.call("copy_to_prefix", ...)
    │       │   └── MakaiRPC.call("scan_prefix_for_exes", ...)
    │       │
    │       ├── [Modo INSTALLER]:
    │       │   ├── MakaiRPC.call("snapshot_prefix", ...) BEFORE
    │       │   ├── runInstallerInContainer()
    │       │   │   └── spawn umu-run com INSTALL_CLEAN_ENV
    │       │   ├── MakaiRPC.call("snapshot_prefix", ...) AFTER
    │       │   └── MakaiRPC.call("find_new_executables", ...)
    │       │
    │       └── [Modo PORTABLE]:
    │           ├── MakaiRPC.call("copy_to_prefix", ...)
    │           └── MakaiRPC.call("scan_prefix_for_exes", ...)
    │
    └── returnOrSelect()
        │
        ├── [Se auto-match encontrado]:
        │   └── Retorna { autoSetExe: matched.path }
        │
        ├── [Se candidates > 0]:
        │   └── WindowManager.createExecutableSelectWindow()
        │       └── Mostra ExecutableCandidateModal
        │
        └── [Se sem candidates]:
            └── Retorna { suggestedDir }
```

---

## 5. Árvore de Seleção de Executável

```
usuário seleciona executável no ExecutableCandidateModal
│
└── React: handleExePicked(path)
    │
    ├── window.electron.setGameExecutablePath(shop, objectId, path)
    │   └── Main: gamesStore.put(gameKey, { executablePath: path })
    │
    ├── setShowInstallSuccessModal(true)
    │   └── Modal: "Instalação concluída!"
    │
    └── handleNavigateToGames()
        ├── updateLibrary()
        └── navigate("/games")
```

---

## 6. Árvore de Comunicação Python ↔ TypeScript

```
┌──────────────────────────────────────────────────────────┐
│  ELECTRON (TypeScript)                                    │
│                                                          │
│  MakaiRPC.call(method, params)                           │
│    │                                                     │
│    ├── "detect_installer_type" ──────────────────────┐   │
│    ├── "copy_to_prefix" ────────────────────────────┤   │
│    ├── "scan_prefix_for_exes" ──────────────────────┤   │
│    ├── "snapshot_prefix" ───────────────────────────┤   │
│    ├── "find_new_executables" ──────────────────────┤   │
│    └── "install_game" ──────────────────────────────┤   │
│                                                      │   │
│  MakaiRPC: spawn("python3", ["server.py", "--stdio"])│   │
│    │                                                │   │
│    │  stdin: {"id":1,"method":"...","params":{}}    │   │
│    └────────────────────────────────────────────────│───┘
│                                                      │
└──────────────────────────────────────────────────────│────┘
                                                       │ JSON-lines
                                                       ▼
┌──────────────────────────────────────────────────────────┐
│  PYTHON (server.py)                                       │
│                                                          │
│  @register("detect_installer_type")                      │
│    └── game_install.detect_installer_type(source_path)   │
│                                                          │
│  @register("copy_to_prefix")                             │
│    └── game_install.copy_to_prefix(source, prefix)       │
│        ├── _walk_dir() → lista arquivos                  │
│        ├── SHA256 pré-cópia                              │
│        ├── shutil.copy2() em lotes de 50                 │
│        └── SHA256 pós-cópia → verifica                   │
│                                                          │
│  @register("scan_prefix_for_exes")                       │
│    └── game_install.scan_prefix_for_exes(prefix)         │
│        └── Escaneia drive_c/ por .exe jogáveis           │
│                                                          │
│  @register("snapshot_prefix")                            │
│    └── game_install.snapshot_prefix(prefix)              │
│        └── Lista completa de arquivos drive_c/           │
│                                                          │
│  @register("find_new_executables")                       │
│    └── game_install.find_new_executables(before, after)  │
│        └── Compara snapshots → retorna .exe novos        │
│                                                          │
│  stdout: {"id":1,"result":{...}}                         │
└──────────────────────────────────────────────────────────┘
```

---

## 7. Árvore de Extração (7zip)

```
GameFilesManager.extractDownloadedFile()
│
├── downloadsStore.get(gameKey)
├── gamesStore.get(gameKey)
│
├── [Se arquivo comprimido]:
│   └── SevenZip.extractFile({
│         filePath,
│         outputPath,
│         passwords: ["online-fix.me", "steamrip.com"]
│       })
│       │
│       ├── Executa: 7z x <file> -o<output> -p<password>
│       ├── Emite progresso: updateExtractionProgress()
│       │   └── mainWindow.webContents.send("on-extraction-progress", ...)
│       │
│       └── [Sucesso]:
│           ├── extractFilesInDirectory(outputPath)
│           │   ├── readdir() → lista arquivos
│           │   ├── Filtra: .zip, .rar, .7z, .tar, .tar.gz, .tar.xz
│           │   ├── Para cada arquivo comprimido:
│           │   │   └── SevenZip.extractFile()
│           │   └── Se automaticDeleteArchiveFiles → deleta originais
│           │
│           ├── downloadsStore.put(gameKey, { folderName: "game" })
│           │
│           └── setExtractionComplete()
│               ├── Calcula installedSizeInBytes
│               ├── mainWindow.webContents.send("on-extraction-complete")
│               ├── publishExtractionCompleteNotification()
│               └── searchAndBindExecutable()
│                   ├── GameExecutables.getExecutablesForGame(objectId)
│                   ├── findExecutableInFolder() → busca recursiva
│                   └── Se encontrado → gamesStore.put({ executablePath })
```

---

## 8. Árvore de Inserção na Aba Games

```
handleExePicked(path)
│
├── window.electron.setGameExecutablePath(shop, objectId, path)
│   └── gamesStore.put(gameKey, { executablePath: path })
│
└── handleNavigateToGames()
    ├── updateLibrary()
    │   └── IPC: window.electron.getLibrary()
    │       └── Main: getLibrary()
    │           ├── gamesStore.iterator() → todos os jogos
    │           └── Retorna LibraryGame[] com download status
    │
    └── navigate("/games")
        │
        └── React: Games/index.tsx
            │
            ├── useGamesPage()
            │   ├── gamesService.getAll() → gamesStore
            │   ├── Junta Steam games + Library games
            │   └── Filtra por seção (Steam / Local)
            │
            ├── Seção Local:
            │   └── GameCard para cada jogo com executablePath
            │       ├── Imagem de capa
            │       ├── Título
            │       └── Ações: Play, Config, Wine Tools
            │
            └── GameBar (barra inferior)
                ├── ▶️ Play → window.electron.openGame()
                │   └── open-game.ts → launchGame()
                │       └── spawn umu-run
                └── ⚙️ Config → GameConfigModal
```

---

## 9. Mapa de Eventos IPC (Registros)

Todos os eventos IPC registrados para o fluxo de downloads:

| Evento IPC | Arquivo Registrador | Função |
|------------|---------------------|--------|
| `startGameDownload` | `start-game-download.ts` | Inicia download |
| `pauseGameDownload` | (via DownloadManager) | Pausa download |
| `resumeGameDownload` | (via DownloadManager) | Retoma download |
| `cancelGameDownload` | (via DownloadManager) | Cancela download |
| `extractGameDownload` | `extract-game-download.ts` | Extrai download |
| `openGameInstaller` | `open-game-installer.ts` | Abre instalador |
| `setGameExecutablePath` | `set-game-executable-path.ts` | Salva .exe |
| `getInstalledProtonVersions` | `get-installed-proton-versions.ts` | Lista Protons |
| `downloadProton` | (proton events) | Baixa Proton |
| `openGame` | `open-game.ts` | Abre/joga jogo |
| `getLibrary` | `get-library.ts` | Lista jogos |
| `installLibrary` | `install-library.ts` | Instala DLLs |
| `getGameInstallerActionType` | `get-game-installer-action-type.ts` | Tipo de ação pós-download |
| `deleteGameFolder` | `delete-game-folder.ts` | Deleta arquivos |
| `removeGame` | `remove-game.ts` | Remove do store |

---

## 10. Fluxo de Dados — Store Keys

```
downloadsStore
├── key: "steam:12345"
│   └── {
│         shop: "steam",
│         objectId: "12345",
│         uri: "magnet:?xt=...",
│         downloadPath: "/home/user/Downloads",
│         folderName: "game-name",     // atualizado pós-extração
│         status: "active" | "paused" | "complete" | "seeding" | "error" | "removed",
│         progress: 0.75,             // 0 a 1
│         bytesDownloaded: 150000000,
│         fileSize: 200000000,
│         downloader: 1 | 2,          // 1=HTTP, 2=Torrent
│         shouldSeed: true,
│         extracting: false,
│         automaticallyExtract: true,
│         queued: false,
│         qbHash: "abc123...",         // hash do torrent
│         fileIndices: [0, 1, 2],     // download seletivo
│         timestamp: 1692345678000
│       }

gamesStore
├── key: "steam:12345"
│   └── {
│         shop: "steam",
│         objectId: "12345",
│         title: "Game Name",
│         executablePath: "/home/user/.config/makai-forger/.../drive_c/.../game.exe",
│         winePrefixPath: "/home/user/games/ProtonForger/game-name/",
│         protonPath: "/home/user/.steam/steam/steamapps/common/GE-Proton9-7/",
│         protonVersion: "GE-Proton9-7",
│         downloadSource: "catalog",
│         downloadUrl: "magnet:?xt=...",
│         installerSizeInBytes: 2000000000,
│         installedSizeInBytes: 5000000000,
│         playTimeInMilliseconds: 0,
│         lastTimePlayed: null,
│         isDeleted: false
│       }
```

# Fluxo Detalhado — Download → Extração → Instalação → Games

> Este documento detalha CADA passo do fluxo, incluindo todos os pontos de decisão, ramificações e possíveis estados.

---

## Passo 1 — Usuário clica "Download"

### 1.1 Origem

| Origem | Chamada |
|--------|---------|
| Catálogo (grid de jogos) | `startGameDownload(payload)` |
| Game Details (página do jogo) | `startGameDownload(payload)` |
| CompactFlow (exterior) | `openGameInstaller()` direto (sem download) |

### 1.2 Validações no startGameDownload

```
startGameDownload(payload)
│
├── Valida payload (shop, objectId, uri obrigatórios)
├── Cria gameKey: game(shop, objectId)
│
├── Pausa download ativo atual:
│   └── DownloadManager.pauseDownload()
│       ├── [JS HTTP] → jsDownloader.pauseDownload()
│       └── [TORRENT] → torrentBackend.pause(gameId)
│
├── Pausa TODOS os downloads ativos no store:
│   └── Para cada download com status="active" e progress !== 1:
│       └── downloadsStore.put(key, { ...download, status: "paused" })
│
├── prepareGameEntry() → cria/atualiza game no gamesStore
│   └── Se não existe → cria entry básica
│
├── Cancela download anterior do mesmo jogo:
│   └── DownloadManager.cancelDownload(gameKey)
│
├── Normaliza URI:
│   ├── normalizeDownloadUri(uri) → remove \r\n, decodifica &amp;
│   └── appendTrackersToMagnet(uri, getTrackers()) → adiciona trackers
│
├── Cria objeto Download:
│   {
│     shop, objectId,
│     status: "active",
│     progress: 0,
│     bytesDownloaded: 0,
│     downloadPath,
│     downloader,           // 1=HTTP, 2=Torrent
│     uri: finalUri,
│     folderName: null,
│     shouldSeed: false,
│     timestamp: Date.now(),
│     queued: true,
│     extracting: false,
│     automaticallyExtract,
│     automaticallyDeleteArchiveFiles,
│     fileIndices,
│     selectedFilesSize,
│   }
│
├── Salva no downloadsStore
│
├── Salva metadados no gamesStore:
│   └── { downloadSource: "catalog", downloadUrl: finalUri, downloader }
│
└── DownloadManager.startDownload(download)
```

### 1.3 DownloadManager.startDownload()

```
startDownload(download)
│
├── Define downloadingGameId = gameKey
│
├── [SE HTTP] → isHttpDownloader(downloader) === true
│   │
│   ├── usingJsDownloader = true
│   ├── isPreparingDownload = true
│   │
│   ├── getJsDownloadOptions(download)
│   │   └── Resolve URL final, headers, auth tokens
│   │   └── Se falha → throw Error
│   │
│   ├── new JsHttpDownloader()
│   ├── jsDownloader.setMaxDownloadSpeedBytesPerSecond(limit)
│   ├── isPreparingDownload = false
│   │
│   ├── logResolvedUrl(options.url)
│   │
│   └── jsDownloader.startDownload(options)
│       ├── Emite progresso via IPC:
│       │   └── mainWindow.webContents.send("on-download-progress", {
│       │         gameId, progress, downloadSpeed, bytesDownloaded,
│       │         fileSize, folderName, ...
│       │       })
│       └── Emite "on-download-progress" a cada chunk recebido
│
└── [SE TORRENT] → isHttpDownloader(downloader) === false
    │
    ├── usingJsDownloader = false
    ├── isPreparingDownload = true
    │
    └── torrentBackend.startDownload(gameId, magnet, savePath)
        │
        ├── QBittorrentClient → http://localhost:8081
        │
        ├── Login (se necessário):
        │   └── POST /api/v2/auth/login
        │       body: username=admin&password=
        │       → cookie SID salvo
        │
        ├── Extrai hash do magnet:
        │   └── regex: /urn:btih:([A-Fa-f0-9]{40})/i
        │
        ├── Salva qbHash no downloadsStore
        │
        ├── Normaliza magnet:
        │   ├── normalizeDownloadUri(magnet)
        │   └── appendTrackersToMagnet(magnet, getTrackers())
        │       └── Adiciona trackers conhecidos
        │
        └── POST /api/v2/torrents/add
            body: urls=<magnet>&savepath=<downloadPath>&category=ProtonForge
```

---

## Passo 2 — Download em andamento

### 2.1 Polling (main-loop)

A cada 2 segundos, o `main-loop.ts` chama:
```typescript
DownloadManager.watchDownloads()
```

### 2.2 getDownloadStatus()

```
getDownloadStatus(downloadingGameId, usingJsDownloader, ...)
│
├── [SE JS HTTP E tem downloadingGameId]
│   └── getDownloadStatusFromJs(gameId, jsDownloader, isPreparing)
│       └── jsDownloader.getProgress()
│           └── Retorna: { progress, downloadSpeed, bytesDownloaded, ... }
│
├── [SE TORRENT E tem downloadingGameId]
│   └── torrentBackend.getStatus(gameId)
│       ├── QBittorrentClient.getTorrents()
│       │   └── GET /api/v2/torrents/info
│       │   └── Retorna lista de todos os torrents
│       │
│       ├── Encontra torrent pelo hash:
│       │   └── torrents.find(t => t.hash === qbHash)
│       │
│       ├── [Se não encontrou] → pode ter sido removido
│       │   └── Retorna estado "removed"
│       │
│       ├── Mapeia state → statusCode:
│       │   ├── "downloading", "forceddl", "stalleddl" → 3
│       │   ├── "uploading", "forcedup", "stalledup" → 5
│       │   ├── "completed", "pausedup" → 4
│       │   ├── "metadl", "forcedmetadl" → 2
│       │   └── "checkingdl", "checkingup", "checkingresumedata", "allocating" → 1
│       │
│       ├── Calcula bytesDownloaded = fileSize * progress
│       ├── Calcula ETA = calculateETA(fileSize, bytesDownloaded, dlspeed)
│       │
│       └── Retorna DownloadProgress completo
│
└── [SE NENHUM downloadingGameId]
    └── null
```

### 2.3 watchDownloads() — Pós-status

```
watchDownloads(status)
│
├── [Se status é null] → retorna
│
├── Busca download e game no store
│
├── [Se state === "removed"] (torrent removido externamente)
│   └── Atualiza downloadsStore: status: "removed", queued: false
│
├── sendProgressUpdate(progress, status, game)
│   └── mainWindow.webContents.send("on-download-progress", {
│         ...status, game
│       })
│   └── mainWindow.setProgressBar(progress) → barra de tarefa
│
└── [Se progress === 1 E !isCheckingFiles E !isDownloadingMetadata]
    └── handleDownloadCompletion(download, game, gameId, true, ...)
```

### 2.4 UI — O que o usuário vê

Enquanto o download está ativo, a UI atualiza:
- **Barra de progresso** (largura = progress * 100%)
- **Velocidade** (formatBytes(downloadSpeed) + "/s")
- **ETA** (calculado a partir de bytes restantes / velocidade)
- **Gráfico SpeedChart** (histórico de velocidade)
- **Stats**: rede, pico, seeds/peers, arquivos (se batch)
- **Badge do downloader**: "qBittorrent" ou "HTTP"

---

## Passo 3 — Download completa

### 3.1 handleDownloadCompletion()

```
handleDownloadCompletion(download, game, gameId, shouldSeed, handleExtractionFn, processNextFn)
│
├── publishDownloadCompleteNotification(game)
│   └── Notificação do sistema: "Download concluído: Game Name"
│
├── Lê UserPreferences do db
│   └── seedAfterDownloadComplete (se deve fazer seeding)
│
├── updateDownloadStatus(download, gameId, userPreferences.seedAfterDownloadComplete)
│   │
│   ├── [SE shouldSeed E Torrent E NÃO download seletivo]:
│   │   └── status: "seeding", shouldSeed: true, queued: false
│   │   └── Retorna true (é seeding)
│   │
│   └── [SE NÃO]:
│       └── status: "complete", shouldSeed: false, queued: false
│       └── Retorna false (não é seeding)
│
├── Se shouldSeed → salva shouldSeed: true no downloadsStore
│
├── Calcula tamanho: getDirectorySize(downloadPath/folderName)
│   └── Salva installerSizeInBytes no gamesStore
│
├── handleExtractionFn(download, game)
│   │   (ver seção Extração abaixo)
│   │
│   └── Se extraction completa:
│       └── searchAndBindExecutable() → tenta auto-detectar .exe
│
└── processNextFn() → processNextQueuedDownload()
    └── Se tem download na fila → inicia próximo
```

### 3.2 Extração

```
handleExtraction(download, game)
│
├── GameFilesManager.extractDownloadedFile()
│   │
│   ├── Valida: download existe, folderName existe
│   │
│   ├── filePath = downloadPath/folderName
│   ├── extractionPath = downloadPath/name_without_extension
│   │
│   ├── [SE arquivo comprimido (.zip, .rar, .7z, .tar, etc.)]:
│   │   ├── SevenZip.extractFile({
│   │   │     filePath,
│   │   │     outputPath: extractionPath,
│   │   │     passwords: ["online-fix.me", "steamrip.com"]
│   │   │   })
│   │   ├── Com progresso callback:
│   │   │   └── updateExtractionProgress(percent/100)
│   │   │       └── mainWindow.webContents.send("on-extraction-progress", ...)
│   │   │
│   │   ├── Se sucesso:
│   │   │   ├── extractFilesInDirectory(extractionPath) → extrai aninhados
│   │   │   ├── Atualiza folderName: de "game.zip" para "game"
│   │   │   ├── Se automaticDeleteArchiveFiles → deleta .zip/.rar
│   │   │   └── setExtractionComplete()
│   │   │
│   │   └── Se falha:
│   │       └── failExtraction(error)
│   │           └── Emite "on-extraction-failed"
│   │
│   ├── [SE é .exe/.msi/.bin/.run/.sh]:
│   │   └── setExtractionComplete() → não precisa extrair
│   │
│   └── [SE pasta com arquivos comprimidos]:
│       └── extractFilesInDirectory()
│           ├── Lista arquivos .zip/.rar/.7z
│           ├── Filtra part1.rar (não extrai part2, part3...)
│           ├── Para cada arquivo:
│           │   └── SevenZip.extractFile() com progresso
│           └── Se automaticDeleteArchiveFiles → deleta originais
│
└── setExtractionComplete()
    ├── Calcula installedSizeInBytes
    ├── Emite "on-extraction-complete"
    ├── publishExtractionCompleteNotification()
    └── searchAndBindExecutable()
        ├── Busca nomes conhecidos: GameExecutables.getExecutablesForGame()
        ├── Busca recursivamente na pasta do download
        └── Se encontrar → salva executablePath no gamesStore
```

### 3.3 Estado na UI pós-extração

O download aparece na seção "DOWNLOADS CONCLUÍDOS" com:
- Status: "CONCLUÍDO"
- Botão **📦 Instalar** (PackageIcon) → inicia fluxo de instalação
- Botão **🗑️ Remover** → deleta arquivos

---

## Passo 4 — Usuário clica "Instalar"

### 4.1 handleOpenGameInstaller()

```
handleOpenGameInstaller(shop, objectId)
│   [use-install-flow.ts]
│
├── getInstalledProtonVersions()
│   └── window.electron.getInstalledProtonVersions()
│       └── Umu.getInstalledProtonVersions()
│           └── Escaneia diretórios de Proton:
│               ├── ~/.steam/steam/steamapps/common/Proton*
│               ├── ~/.steam/steam/compatibilitytools.d/
│               ├── /usr/share/steam/compatibilitytools.d/
│               └── userData/compat-tools/compatibilitytools.d/
│           └── Valida cada pasta: precisa ter "proton" + "toolmanifest.vdf"
│
├── [Se NENHUM Proton]:
│   └── navigate("/proton-tools")
│       └── Usuário precisa instalar um Proton primeiro
│
├── [Se tem Protons]:
│   ├── Salva pendências:
│   │   ├── pendingInstallRef = [shop, objectId]
│   │   ├── pendingGameRef = [shop, objectId]
│   │   ├── pendingGameIdRef = objectId
│   │   └── pendingGameTitleRef = game.title
│   │
│   ├── Salva installedProtons no state
│   │
│   └── setShowRecommendationModal(true)
│       └── Mostra ProtonRecommendationModal
```

### 4.2 ProtonRecommendationModal

O modal mostra:
1. **Lista de Protons instalados** — cada um com nome, versão, tier
2. **Botão "Baixar e Selecionar"** — para Protons não instalados
3. **Botão "Usar este"** — para Protons já instalados

### 4.3 [Opção A] Proton já instalado

```
handleSelectProton(protonPath)
│
├── setShowRecommendationModal(false)
│
├── Valida pendingInstallRef
│
├── Set installProgress:
│   { status: "prefix", percent: 80, gameTitle }
│
├── pendingInstallRef = null
│
└── window.electron.openGameInstaller(shop, objectId, protonPath, gameTitle)
    └── (ver Passo 5)
```

### 4.4 [Opção B] Baixar Proton

```
handleDownloadAndSelect(fork)
│
├── setShowRecommendationModal(false)
│
├── Valida pendingInstallRef
│
├── window.electron.downloadProton(fork)
│   ├── findToolIdByForkName(fork) → mapeia nome → toolId
│   ├── getReleases(toolId) → busca releases no GitHub/Forgejo
│   │   └── Cache em data/releases/{toolId}.json
│   └── downloadTool({ toolId, release })
│       ├── downloadFile(url, dest) → stream HTTP
│       └── extractArchive(tar.xz/tar.gz/zip)
│           └── Ex: ~/.config/makai-forger/compat-tools/GE-Proton9-7/
│
├── pendingInstallRef = null
│
└── window.electron.openGameInstaller(shop, objectId, protonPath, gameTitle)
    └── (ver Passo 5)
```

---

## Passo 5 — openGameInstaller() (Main Process)

```
openGameInstaller(_event, shop, objectId, protonPath, gameTitle, folderName)
│   [ForgePipeline/events/open-game-installer.ts]
│
├── Busca download e game no store
│
├── Calcula winePrefixPath:
│   └── Wine.getEffectivePrefixPath(null, objectId, gameTitle)
│       └── ~/games/ProtonForger/<game_name>/
│
├── [Se tem protonPath E winePrefixPath]:
│   └── setupPrefix(gameId, protonPath, winePrefixPath)
│       ├── Cria diretório se não existe
│       ├── spawn umu-run wineboot -u
│       │   └── Env: WINEPREFIX, PROTONPATH
│       └── Retorna true/false
│
├── Salva protonPath e protonVersion no gamesStore
│
├── Procura pasta do jogo:
│   ├── [Se tem folderName] → path.join(downloadPath, folderName)
│   └── [Se não] → findGameFolder(gameTitle)
│       └── Busca na pasta Downloads por nome similar
│
├── [Se pasta não encontrada]:
│   └── Retorna { wasOpened, candidates: [], suggestedDir }
│
├── Lê installConfig do game:
│   ├── winetricks[] → verbos do winetricks
│   └── gameDlls[] → DLLs para instalar
│
├── [Se tem winetricks/gameDlls]:
│   ├── ensureWinetricks() → garante MakaiTricks instalado
│   └── ProtonRecommendationService.installGameDlls()
│       └── Instala DLLs recomendadas
│
├── [Se arquivo único .exe/.msi]:
│   └── installGame(gamePath, {
│         prefixPath, protonPath, gameId, existingExePath
│       })
│       └── (ver Passo 6)
│
├── [Se PASTA]:
│   └── installGame(gamePath, {
│         prefixPath, protonPath, gameId, existingExePath
│       })
│       └── (ver Passo 6)
│
└── returnOrSelect() → decide próximo passo
```

---

## Passo 6 — installGame()

```
installGame(sourcePath, options)
│   [game-launcher/install/install-game.ts]
│
├── absSource = path.resolve(sourcePath)
├── absPrefix = path.resolve(prefixPath)
├── actual = resolveActualPrefix(absPrefix)
│   └── Verifica se drive_c/windows/system32 existe
│   └── Se não, verifica se pfx/drive_c/windows/system32 existe
├── driveC = actual/drive_c
│
├── [SE existingExePath existe E arquivo existe]:
│   │   → MODO RESTORE (jogo já foi instalado antes)
│   │
│   ├── Copia pasta para o prefixo:
│   │   └── MakaiRPC.call("copy_to_prefix", { source_path, prefix_path })
│   │       └── Python: game_install.py :: copy_to_prefix()
│   │           ├── Lista arquivos com _walk_dir()
│   │           ├── Calcula SHA256 pré-cópia (lotes de 20)
│   │           ├── Copia em lotes de 50 com shutil.copy2()
│   │           └── Verifica SHA256 pós-cópia
│   │
│   ├── [Se hashes divergentes]:
│   │   └── Retorna erro: "X arquivo(s) com hash divergente"
│   │
│   ├── Scan de executáveis:
│   │   └── MakaiRPC.call("scan_prefix_for_exes", { prefix_path, game_folder_name })
│   │       └── Python: game_install.py :: scan_prefix_for_exes()
│   │
│   └── Retorna candidates[]
│
├── [SE NOVO jogo]:
│   │
│   ├── Detecta tipo:
│   │   └── MakaiRPC.call("detect_installer_type", { source_path })
│   │       └── Python: game_install.py :: detect_installer_type()
│   │           ├── Analisa extensão (.exe, .msi, etc.)
│   │           ├── Analisa conteúdo da pasta
│   │           └── Retorna: { is_installer, installer_path, exe_count, total_files }
│   │
│   ├── [Se INSTALLER]:
│   │   │
│   │   ├── Snapshot BEFORE:
│   │   │   └── MakaiRPC.call("snapshot_prefix", { prefix_path })
│   │   │       └── Python: lista todos os arquivos drive_c/ com size, mtime, isDir
│   │   │
│   │   ├── Executa instalador:
│   │   │   └── runInstallerInContainer(installerExe, protonPath, prefixPath)
│   │   │       ├── umuBinary = getUmuBinaryPath()
│   │   │       │   └── app/_resources/binaries/umu-run
│   │   │       ├── pythonBin = getPythonBin()
│   │   │       │   └── tools/venv/bin/python ou /usr/bin/python3
│   │   │       ├── Env:
│   │   │       │   ├── WINEPREFIX=<expandedPrefix>
│   │   │       │   ├── PROTONPATH=<expandedProton>
│   │   │       │   ├── PROTON_LOG=1
│   │   │       │   └── INSTALL_CLEAN_ENV (desativa DXVK, ESYNC, etc.)
│   │   │       ├── spawn(usePython ? pythonBin : umuBinary, args, {
│   │   │       │     stdio: "ignore",
│   │   │       │     detached: true
│   │   │       │   })
│   │   │       └── Aguarda exit code
│   │   │
│   │   ├── [Se exitCode === -1]:
│   │   │   └── Erro: "Não foi possível abrir o instalador"
│   │   │
│   │   ├── [Se exitCode !== 0]:
│   │   │   └── Avisa mas continua (instalador pode ter funcionado)
│   │   │
│   │   ├── Snapshot AFTER:
│   │   │   └── MakaiRPC.call("snapshot_prefix", { prefix_path })
│   │   │
│   │   ├── Compara snapshots:
│   │   │   └── MakaiRPC.call("find_new_executables", { before, after })
│   │   │       └── Python: retorna .exe NOVOS, prioriza por mtime
│   │   │
│   │   └── [Se candidates > 0]:
│   │       └── Retorna candidates[]
│   │
│   └── [Se PORTABLE]:
│       │
│       ├── Validações:
│       │   ├── [Se exe_count === 0 E total_files > 0]:
│       │   │   └── Aviso: "nenhum .exe encontrado"
│       │   ├── [Se total_files > 5000]:
│       │   │   └── Aviso: "pasta com muitos arquivos"
│       │   └── [Se total_files > 50000]:
│       │       └── Erro: "Pasta muito grande"
│       │
│       ├── Copia pasta para o prefixo:
│       │   └── MakaiRPC.call("copy_to_prefix", { source_path, prefix_path })
│       │
│       ├── [Se hashes divergentes]:
│       │   └── Erro: "X arquivo(s) com hash divergente"
│       │
│       └── Scan de executáveis:
│           └── MakaiRPC.call("scan_prefix_for_exes", { prefix_path })
│
└── Retorna InstallResult:
    {
      success: boolean,
      candidates: [{ path, name, size }],
      suggested_dir: string,
      method: "installer" | "portable" | "restore",
      error?: string
    }
```

---

## Passo 7 — Seleção de Executável

### 7.1 returnOrSelect()

```
returnOrSelect(shop, objectId, candidates, suggestedDir, gameTitle, gameKey, prefixDriveCPath, existingExePath)
│
├── [Se existingExePath E candidates > 0]:
│   └── Tenta auto-match:
│       ├── targetName = basename(existingExePath).toLowerCase()
│       ├── matched = candidates.find(c => c.name.toLowerCase() === targetName)
│       └── [Se encontrou] → retorna { autoSetExe: matched.path }
│
├── [Se candidates > 0]:
│   └── Cria ExecutableSelectWindow:
│       ├── WindowManager.createExecutableSelectWindow({
│       │     shop, objectId, candidates, suggestedDir,
│       │     prefixDriveCPath, gameTitle, gameKey
│       │   })
│       └── WindowManager.showExecutableSelectWindow()
│
└── [Se sem candidates]:
    └── Retorna { suggestedDir }
        └── Usuário pode usar file picker manual
```

### 7.2 ExecutableCandidateModal (Renderer)

O modal mostra:
- Lista de executáveis encontrados (cada um com nome, tamanho)
- Botão "Procurar" → abre file picker
- Botão "Confirmar" → seleciona executável

### 7.3 handleExePicked(path)

```
handleExePicked(path)
│
├── setShowCandidateModal(false)
│
├── Valida pendingGameRef
│
├── window.electron.setGameExecutablePath(shop, objectId, path)
│   └── Salva no gamesStore: { executablePath: path }
│
├── setShowInstallSuccessModal(true)
│   └── Modal: "Instalação concluída!"
│
└── handleNavigateToGames()
    ├── updateLibrary()
    └── navigate("/games")
```

---

## Passo 8 — Jogo na Aba Games

### 8.1 Como aparece

Após `setGameExecutablePath()`:
1. `gamesStore` atualizado com `executablePath`
2. `updateLibrary()` → recarrega lista de jogos
3. Aba Games carrega via `gamesService.getAll()`
4. Jogo aparece na seção "Local" com:
   - Imagem de capa
   - Título
   - Botão Play
   - Botão Config
   - Botão Wine Tools

### 8.2 Ações disponíveis

| Ação | O que faz |
|------|-----------|
| **Play** | `window.electron.openGame()` → `open-game.ts` → `launchGame()` |
| **Config** | `GameConfigModal` → 10 abas (prefix, proton, launch options, etc.) |
| **Wine Tools** | `runWineTool()` → Explorer, Regedit, Winetricks, Console, Kill |
| **Backup** | Cria backup do prefixo |
| **Delete** | Deleta prefixo + arquivos |
| **Favoritar** | Adiciona aos favoritos |
| **Cloud Sync** | Sincroniza saves na nuvem |

### 8.3 launchGame()

```
launchGame({ shop, objectId, executablePath, launchOptions })
│
├── [Se Steam] → spawn steam steam://rungameid/<id>
│
├── [Se Wine/Proton]
│   ├── Encontra Proton path
│   ├── Monta comando:
│   │   umu-run <proton> <prefix> <executable> [launchOptions]
│   ├── Env vars:
│   │   ├── WINEPREFIX=<prefix>
│   │   ├── PROTONPATH=<proton>
│   │   ├── STORE=<shop>
│   │   ├── GAMEID=<objectId>
│   │   ├── DXVK_HUD=<config>
│   │   └── MANGOHUD=<config>
│   └── spawn(detached: true)
│
└── Jogo inicia!
```

---

## Resumo dos Estados de um Download

```
                    ┌─────────────┐
                    │  INÍCIO     │
                    │  (clicou    │
                    │  "Download")│
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  ACTIVE     │ ← status: "active"
                    │  (baixando) │    queued: true
                    │             │    progress: 0→1
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │  PAUSED  │ │  ERROR   │ │ COMPLETE │
       │ (pausado)│ │ (erro)   │ │ (100%)   │
       └────┬─────┘ └──────────┘ └────┬─────┘
            │                         │
            ▼                         ▼
       ┌──────────┐           ┌──────────────┐
       │  RESUME  │           │  EXTRACTING  │ ← extracting: true
       │ (retomar)│           │  (extraindo) │
       └──────────┘           └──────┬───────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │  SEEDING     │ ← se shouldSeed=true
                              │  (compart.)  │    e downloader=Torrent
                              └──────┬───────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │  CONCLUÍDO   │ ← status: "complete"
                              │  (pronto p/  │    extracting: false
                              │   instalar)  │
                              └──────────────┘
```

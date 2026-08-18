# Relatório Completo — Fluxo de Downloads, Instalação e Exibição na Aba Games

> **Data:** 18/08/2026  
> **Objetivo:** Mapear todo o percurso de um download de jogo no Makai Forge — desde o clique em "Download" no catálogo, passando pelo gerenciamento de downloads (qBittorrent / HTTP), extração, seleção de Proton, instalação com prefixo Wine, até o jogo aparecer na aba Games pronto para jogar.

---

## Índice

1. [Visão Geral do Fluxo](#1-visão-geral-do-fluxo)
2. [Árvore Genealógica Completa](#2-árvore-genealógica-completa)
3. [Fase 1 — Início do Download](#3-fase-1--início-do-download)
4. [Fase 2 — Gerenciamento de Downloads (DownloadManager)](#4-fase-2--gerenciamento-de-downloads)
5. [Fase 3 — Pós-Download: Extração](#5-fase-3--pós-download-extração)
6. [Fase 4 — Botão "Instalar" e Seleção de Proton](#6-fase-4--botão-instalar-e-seleção-de-proton)
7. [Fase 5 — Criação do Prefixo Wine](#7-fase-5--criação-do-prefixo-wine)
8. [Fase 6 — Instalação do Jogo (installGame)](#8-fase-6--instalação-do-jogo)
9. [Fase 7 — Seleção de Executável](#9-fase-7--seleção-de-executável)
10. [Fase 8 — Jogo na Aba Games](#10-fase-8--jogo-na-aba-games)
11. [Sub-aba qBittorrent](#11-sub-aba-qbittorrent)
12. [Arquivos Envolvidos — Mapeamento Completo](#12-arquivos-envolvidos--mapeamento-completo)
13. [Fluxo de Dados entre Camadas](#13-fluxo-de-dados-entre-camadas)
14. [Pontos de Atenção e Possíveis Problemas](#14-pontos-de-atenção-e-possíveis-problemas)

---

## 1. Visão Geral do Fluxo

```
CATÁLOGO → DOWNLOAD → EXTRAÇÃO → INSTALAÇÃO → GAMES
   │           │           │            │           │
   │           │           │            │           └── Jogo aparece na aba Games
   │           │           │            └── Prefixo Wine + executável salvo no store
   │           │           └── 7zip extrai .zip/.rar/.7z
   │           └── DownloadManager (qBittorrent ou HTTP direto)
   └── Usuário clica "Download" no catálogo ou game-details
```

### Fluxo Simplificado

```
1. Usuário clica "Download" no catálogo
   → startGameDownload (IPC) → DownloadManager.startDownload()

2. DownloadManager escolhe backend:
   → Torrent: QBittorrentBackend → qBittorrent WebUI (porta 8081)
   → HTTP: JsHttpDownloader (Node.js)

3. Download acompanha via main-loop (polling a cada N segundos):
   → DownloadManager.watchDownloads() → atualiza UI em tempo real

4. Download completa → extração automática:
   → GameFilesManager.extractDownloadedFile()
   → 7zip extrai .zip/.rar/.7z → pasta extraída

5. Usuário clica "Instalar" (na aba Downloads concluídos):
   → handleOpenGameInstaller() → ProtonRecommendationModal
   → Usuário seleciona Proton (já instalado ou baixa)

6. openGameInstaller() (IPC main):
   → setupPrefix() → cria prefixo Wine
   → installGame() → detecta tipo + instala
   → Retorna candidates (executáveis encontrados)

7. Usuário seleciona executável:
   → setGameExecutablePath() → salva no gamesStore

8. Jogo aparece na aba Games com play button funcional
```

---

## 2. Árvore Genealógica Completa

```
Makai Forge
│
├── APP START (npm run dev / AppImage)
│   ├── main.ts → cria janela, registra eventos
│   ├── main-loop.ts → inicia polling
│   │   ├── DownloadManager.watchDownloads() ──► monitora downloads a cada 2s
│   │   └── DownloadManager.getSeedStatus() ──► monitora seeding
│   └── registerEvents() → registra todos os IPC handlers
│
├── CATÁLOGO (Catalogue/)
│   ├── busca jogo → game-details
│   └── clica "Download"
│       │
│       ▼
│   ┌─── INÍCIO DO DOWNLOAD ───────────────────────────────┐
│   │                                                       │
│   │  window.electron.startGameDownload(payload)           │
│   │       │                                               │
│   │       ▼                                               │
│   │  start-game-download.ts :: startGameDownload()        │
│   │       │                                               │
│   │       ├── Pausa download ativo atual                  │
│   │       ├── Pausa todos os downloads ativos             │
│   │       ├── prepareGameEntry() → cria/atualiza game     │
│   │       ├── Cria objeto Download no downloadsStore      │
│   │       │   { shop, objectId, uri, status:"active",    │
│   │       │     downloader, downloadPath, ... }           │
│   │       ├── Salva downloadUrl no gamesStore             │
│   │       └── DownloadManager.startDownload(download)     │
│   │                                                       │
│   └───────────────────────────────────────────────────────┘
│
├── DOWNLOAD MANAGER (ForgePipeline/services/download/)
│   │
│   ├── startDownload(download)
│   │   │
│   │   ├── [HTTP] JsHttpDownloader
│   │   │   ├── getJsDownloadOptions() → resolve URL final
│   │   │   ├── new JsHttpDownloader()
│   │   │   ├── startDownload(options)
│   │   │   └── Emite eventos de progresso via IPC
│   │   │
│   │   └── [TORRENT] QBittorrentBackend
│   │       ├── QBittorrentClient → WebUI na porta 8081
│   │       ├── addMagnet(magnet, savePath)
│   │       │   └── POST /api/v2/torrents/add
│   │       └── Categorias: "ProtonForge"
│   │
│   ├── watchDownloads() ──► chamado pelo main-loop
│   │   ├── getDownloadStatus() → retorna DownloadProgress
│   │   │   ├── [JS HTTP] → getDownloadStatusFromJs()
│   │   │   ├── [TORRENT] → torrentBackend.getStatus()
│   │   │   │   └── QBittorrentClient.getTorrents()
│   │   │   └── [RPC] → getDownloadStatusFromRpc()
│   │   │
│   │   ├── sendProgressUpdate() → envia para renderer
│   │   │   └── mainWindow.webContents.send("on-download-progress", ...)
│   │   │
│   │   └── Se progress === 1 → handleDownloadCompletion()
│   │       ├── publishDownloadCompleteNotification()
│   │       ├── updateDownloadStatus() → "complete" ou "seeding"
│   │       ├── Calcula tamanho da pasta
│   │       ├── handleExtraction() → se automaticallyExtract
│   │       └── processNextQueuedDownload()
│   │
│   ├── pauseDownload / resumeDownload / cancelDownload
│   └── resumeSeeding / pauseSeeding
│
├── EXTRAÇÃO (ForgePipeline/services/game-files-manager.ts)
│   │
│   ├── GameFilesManager.extractDownloadedFile()
│   │   ├── SevenZip.extractFile() → extrai .zip/.rar/.7z
│   │   ├── Senhas testadas: "online-fix.me", "steamrip.com"
│   │   ├── Atualiza folderName no downloadsStore
│   │   └── setExtractionComplete()
│   │       ├── Calcula installedSizeInBytes
│   │       ├── Emite "on-extraction-complete"
│   │       ├── publishExtractionCompleteNotification()
│   │       └── searchAndBindExecutable() → tenta auto-detectar .exe
│   │
│   └── extractFilesInDirectory() → extrai arquivos .rar/.zip na pasta
│       └── Se automaticDeleteArchiveFiles → deleta .zip/.rar originais
│
├── ABA DOWNLOADS (app/Downloads/)
│   │
│   ├── index.tsx → Página principal
│   │   ├── Sub-aba "Downloads" → DownloadsContent
│   │   └── Sub-aba "qBittorrent" → <webview> http://localhost:8081
│   │
│   ├── DownloadsContent → 3 grupos:
│   │   ├── DownloadAtivo → hero do download em andamento
│   │   │   ├── SpeedChart (gráfico de velocidade)
│   │   │   ├── AnimatedPercentage
│   │   │   ├── Botões: Pausar / Cancelar
│   │   │   └── Stats: velocidade, pico, seeds/peers, arquivos
│   │   ├── DownloadParado → fila de downloads pausados
│   │   └── DownloadConcluido → downloads completos
│   │       └── Botão "Instalar" (PackageIcon) ──► handleOpenGameInstaller
│   │
│   ├── useDownloadsLayout() → classifica library em 3 grupos
│   │   ├── downloading → lastPacket?.gameId === game.id ou extracting
│   │   ├── queued → queued || status === "paused" || "error"
│   │   └── complete → todos os outros
│   │
│   └── useDownloadsGroup() → estado de cada grupo
│       ├── Hero view (primeiro download ativo)
│       ├── Cores dominantes (extraídas da imagem do jogo)
│       ├── Speed history
│       └── Ações: pause, resume, cancel, extract, seeding
│
├── BOTÃO "INSTALAR" ──► Fluxo de Instalação
│   │
│   ├── handleOpenGameInstaller(shop, objectId)
│   │   │   [use-install-flow.ts]
│   │   │
│   │   ├── getInstalledProtonVersions()
│   │   │   └── Umu.getInstalledProtonVersions()
│   │   │       └── Escaneia: ~/.steam/steam/steamapps/common/Proton*
│   │   │                      ~/.steam/steam/compatibilitytools.d/
│   │   │                      /usr/share/steam/compatibilitytools.d/
│   │   │
│   │   ├── Se NENHUM Proton instalado → navega para /proton-tools
│   │   │
│   │   └── Mostra ProtonRecommendationModal
│   │       ├── Lista Protons instalados
│   │       └── Botão "Baixar e Selecionar" (baixa da GitHub)
│   │
│   ├── [Opção A] handleSelectProton(protonPath) ← Proton já instalado
│   │   └── window.electron.openGameInstaller(shop, objectId, protonPath)
│   │
│   └── [Opção B] handleDownloadAndSelect(fork) ← Baixar Proton
│       ├── window.electron.downloadProton(fork) → path
│       └── window.electron.openGameInstaller(shop, objectId, protonPath)
│
├── openGameInstaller() ──► IPC main process
│   │   [ForgePipeline/events/open-game-installer.ts]
│   │
│   ├── Wine.getEffectivePrefixPath() → caminho do prefixo
│   │   └── ~/games/ProtonForger/<game_name>/
│   │
│   ├── setupPrefix(gameId, protonPath, prefixPath)
│   │   └── createPrefix() → spawn umu-run wineboot -u
│   │       └── Cria estrutura drive_c/, system.reg, user.reg
│   │
│   ├── Salva protonPath e protonVersion no gamesStore
│   │
│   ├── Procura pasta do jogo:
│   │   ├── downloadsStore → download.folderName
│   │   └── findGameFolder(gameTitle) → busca na pasta Downloads
│   │
│   ├── Se winetricks/gameDlls configurados → instala DLLs
│   │   ├── ensureWinetricks() → garante MakaiTricks
│   │   └── ProtonRecommendationService.installGameDlls()
│   │
│   ├── installGame(sourcePath, options) ──► instala o jogo
│   │   │   [game-launcher/install/install-game.ts]
│   │   │
│   │   ├── detect_installer_type() via MakaiRPC → Python
│   │   │
│   │   ├── [Se INSTALLER]:
│   │   │   ├── snapshot_prefix() BEFORE (Python)
│   │   │   ├── runInstallerInContainer(exe, proton, prefix)
│   │   │   │   └── spawn umu-run com env PROTON_NO_ESYNC=1, etc.
│   │   │   ├── snapshot_prefix() AFTER (Python)
│   │   │   └── find_new_executables() (compara snapshots)
│   │   │
│   │   ├── [Se PORTABLE]:
│   │   │   ├── copy_to_prefix() via MakaiRPC → Python
│   │   │   │   └── Cópia com verificação SHA256
│   │   │   └── scan_prefix_for_exes() → Python
│   │   │
│   │   └── Retorna: { success, candidates[], suggested_dir, method }
│   │
│   └── returnOrSelect() → decide próximo passo
│       ├── Se candidates > 0 → cria ExecutableSelectWindow
│       └── Se sem candidates → retorna suggestedDir
│
├── SELEÇÃO DE EXECUTÁVEL
│   │
│   ├── ExecutableCandidateModal
│   │   ├── Lista de executáveis encontrados
│   │   └── Botão "Procurar" → openExeFilePicker()
│   │
│   └── handleExePicked(path)
│       └── window.electron.setGameExecutablePath(shop, objectId, path)
│           └── Salva no gamesStore: { executablePath: path }
│
└── JOGO NA ABA GAMES
    │
    ├── Library store atualizado (updateLibrary())
    │
    ├── useGamesPage() → carrega jogos
    │   ├── gamesService.getAll() → gamesStore
    │   └── Junta Steam games + Library games
    │
    ├── GameCard / GameBar
    │   ├── playGame() → window.electron.openGame()
    │   │   └── open-game.ts → launchGame()
    │   ├── Config → GameConfigModal (10 abas)
    │   └── Wine Tools → runWineTool()
    │
    └── Jogo pronto para jogar!
```

---

## 3. Fase 1 — Início do Download

### 3.1 Origem do Download

O download pode ser iniciado de duas formas:

**A) Via Catálogo** — Usuário busca jogo → clica "Download"
**B) Via game-details** — Usuário está na página do jogo → clica "Download"

Ambas chamam:
```typescript
window.electron.startGameDownload(payload)
```

### 3.2 Payload do Download

```typescript
interface StartGameDownloadPayload {
  shop: GameShop;           // "steam" | "custom" | "epic" etc.
  objectId: string;         // ID único do jogo
  title: string;            // Nome do jogo
  uri: string;              // Magnet link, URL HTTP, etc.
  downloadPath: string;     // Ex: /home/user/Downloads
  downloader: Downloader;   // 1=HTTP, 2=Torrent
  automaticallyExtract: boolean;
  automaticallyDeleteArchiveFiles: boolean;
  fileIndices?: number[];   // Para download seletivo (torrent)
  selectedFilesSize?: number;
}
```

### 3.3 Handler: `start-game-download.ts`

Localização: `src/main/events/torrenting/start-game-download.ts`

```
startGameDownload(payload)
│
├── Pausa download ativo atual (se houver)
├── Pausa TODOS os downloads ativos no store
├── prepareGameEntry() → cria/atualiza game no gamesStore
├── Cancela download anterior do mesmo jogo
├── Normaliza URI e adiciona trackers ao magnet
├── Cria objeto Download:
│   { shop, objectId, uri, status:"active", progress:0,
│     downloader, downloadPath, queued:true, extracting:false }
├── Salva no downloadsStore com key: game(shop, objectId)
├── Salva downloadUrl no gamesStore
└── DownloadManager.startDownload(download)
```

### 3.4 DownloadManager.startDownload()

Localização: `app/_main/installer-api/ForgePipeline/services/download/index.ts`

```
startDownload(download)
│
├── [SE HTTP] → JsHttpDownloader
│   ├── getJsDownloadOptions(download) → resolve URL, headers, etc.
│   ├── Cria new JsHttpDownloader()
│   ├── Define maxDownloadSpeedBytesPerSecond
│   └── jsDownloader.startDownload(options)
│       └── Emite progresso via IPC → renderer atualiza
│
└── [SE TORRENT] → QBittorrentBackend
    ├── QBittorrentClient (conecta porta 8081)
    ├── Login: POST /api/v2/auth/login
    ├── addMagnet(magnetWithTrackers, savePath)
    │   └── POST /api/v2/torrents/add
    │       └── category: "ProtonForge"
    └── Salva qbHash no downloadsStore
```

---

## 4. Fase 2 — Gerenciamento de Downloads

### 4.1 Main Loop (Polling)

Localização: `src/main/services/main-loop.ts`

```typescript
// Inicia na boot do app
startMainLoop() {
  wrapInLoop(() => DownloadManager.watchDownloads(), 2000);  // 2s
  wrapInLoop(() => DownloadManager.getSeedStatus(), 10000);   // 10s
  wrapInLoop(() => processWatcher(), 5000);                   // 5s
}
```

### 4.2 WatchDownloads — Ciclo de Monitoramento

```
DownloadManager.watchDownloads()
│
├── getDownloadStatus(downloadingGameId, ...)
│   │
│   ├── [JS HTTP] → getDownloadStatusFromJs()
│   │   └── jsDownloader.getProgress()
│   │
│   ├── [TORRENT] → torrentBackend.getStatus(gameId)
│   │   ├── QBittorrentClient.getTorrents()
│   │   │   └── GET /api/v2/torrents/info
│   │   ├── Encontra torrent pelo hash
│   │   ├── Mapeia state → statusCode:
│   │   │   downloading → 3
│   │   │   uploading/seeding → 5
│   │   │   completed → 4
│   │   │   checking → 1
│   │   │   metadl → 2
│   │   └── Calcula ETA
│   │
│   └── Retorna DownloadProgress
│
├── sendProgressUpdate() → envia para renderer
│   └── mainWindow.webContents.send("on-download-progress", { ...status, game })
│
├── [Se state === "removed"]
│   └── Atualiza downloadsStore → status: "removed"
│
└── [Se progress === 1 e !isChecking e !isDownloadingMetadata]
    └── handleDownloadCompletion()
```

### 4.3 DownloadProgress (o que a UI recebe)

```typescript
interface DownloadProgress {
  gameId: string;
  progress: number;          // 0 a 1
  downloadSpeed: number;     // bytes/s
  uploadSpeed: number;       // bytes/s
  numPeers: number;
  numSeeds: number;
  bytesDownloaded: number;
  fileSize: number;
  folderName: string;
  status: number;            // 0=paused, 1=checking, 2=metadata, 3=downloading, 4=complete, 5=seeding
  isCheckingFiles: boolean;
  isDownloadingMetadata: boolean;
  timeRemaining: number;     // ms
}
```

### 4.4 UI — Aba Downloads

```
Downloads (index.tsx)
│
├── Sub-aba "Downloads" (ativa por padrão)
│   └── DownloadsContent
│       │
│       ├── [Se tem itens] → 3 grupos:
│       │   │
│       │   ├── 🟢 DOWNLOAD EM ANDAMENTO
│       │   │   └── DownloadAtivo (hero card)
│       │   │       ├── Imagem hero do jogo
│       │   │       ├── Logo (clicável → game-details)
│       │   │       ├── Barra de progresso + porcentagem
│       │   │       ├── Velocidade de download
│       │   │       ├── ETA
│       │   │       ├── SpeedChart (gráfico ao longo do tempo)
│       │   │       ├── Stats: rede, pico, seeds/peers, arquivos
│       │   │       ├── Botões: Pausar / Cancelar
│       │   │       └── Badge do downloader (qBittorrent / HTTP)
│       │   │
│       │   ├── 🟡 FILA DE DOWNLOADS
│       │   │   └── DownloadParado
│       │   │       └── DownloadCards com ações: Retomar / Cancelar
│       │   │
│       │   └── ✅ DOWNLOADS CONCLUÍDOS
│       │       └── DownloadConcluido
│       │           └── DownloadCards com ações:
│       │               ├── 📦 Instalar (PackageIcon) ← FLUXO DE INSTALAÇÃO
│       │               ├── 🗑️ Remover
│       │               └── 📂 Abrir pasta
│       │
│       └── [Se vazio] → "Nenhum download"
│
└── Sub-aba "qBittorrent"
    └── <webview src="http://localhost:8081" />
        (interface web do qBittorrent embutida)
```

---

## 5. Fase 3 — Pós-Download: Extração

### 5.1 Quando dispara

Quando `DownloadManager.watchDownloads()` detecta `progress === 1`:
1. Chama `handleDownloadCompletion()`
2. Se `download.automaticallyExtract === true` → dispara extração

### 5.2 Pipeline de Extração

```
handleDownloadCompletion(download, game, gameId, shouldSeed)
│
├── publishDownloadCompleteNotification()
├── updateDownloadStatus() → status: "complete" ou "seeding"
├── Calcula tamanho: getDirectorySize(installerPath)
│
└── handleExtraction(download, game)
    │
    ├── GameFilesManager.extractDownloadedFile()
    │   │
    │   ├── [Se arquivo .zip/.rar/.7z]
    │   │   ├── SevenZip.extractFile({ filePath, outputPath, passwords })
    │   │   │   └── Senhas: "online-fix.me", "steamrip.com"
    │   │   ├── Atualiza folderName no downloadsStore
    │   │   │   └── de "game.zip" para "game"
    │   │   └── extractFilesInDirectory() → extrai aninhados
    │   │
    │   ├── [Se pasta com arquivos .rar/.zip]
    │   │   └── extractFilesInDirectory() → extrai cada um
    │   │
    │   ├── [Se .exe/.msi/.bin/.run/.sh] → NÃO extrai (é instalador)
    │   │   └── setExtractionComplete()
    │   │
    │   └── Se automaticDeleteArchiveFiles → deleta originais
    │
    ├── setExtractionComplete()
    │   ├── Calcula installedSizeInBytes
    │   ├── Emite "on-extraction-complete"
    │   ├── publishExtractionCompleteNotification()
    │   └── searchAndBindExecutable()
    │       └── Tenta auto-detectar .exe conhecido na pasta
    │           └── GameExecutables.getExecutablesForGame(objectId)
    │
    └── Download aparece como "CONCLUÍDO" na aba Downloads
        └── Botão "📦 Instalar" disponível
```

### 5.3 GameFilesManager — Detalhes

Localização: `app/_main/installer-api/ForgePipeline/services/game-files-manager.ts`

```
GameFilesManager
│
├── extractDownloadedFile()
│   ├── SevenZip.extractFile() → extrai arquivo único
│   ├── extractFilesInDirectory() → extrai aninhados
│   └── setExtractionComplete()
│
├── extractFilesInDirectory(directoryPath)
│   ├── getPathType() → valida que é diretório
│   ├── readdir() → lista arquivos
│   ├── Filtra: FILE_EXTENSIONS_TO_EXTRACT (.zip, .rar, .7z, .tar, .tar.gz, .tar.xz)
│   ├── Para cada arquivo comprimido:
│   │   └── SevenZip.extractFile() com progresso
│   ├── Se automaticDeleteArchiveFiles → deleta originais
│   └── Senão → emite "on-archive-deletion-prompt"
│
├── searchAndBindExecutable()
│   ├── Busca nomes de executáveis conhecidos para o jogo
│   ├── Procura recursivamente na pasta do download
│   └── Se encontrar → salva executablePath no gamesStore
│
├── setExtractionComplete()
│   ├── Calcula tamanho instalado
│   ├── Emite eventos IPC
│   └── searchAndBindExecutable()
│
└── failExtraction(error)
    ├── Restaura status do download
    ├── Emite "on-extraction-failed"
    └── Limpa estado de extração
```

---

## 6. Fase 4 — Botão "Instalar" e Seleção de Proton

### 6.1 O que acontece ao clicar "Instalar"

O botão "Instalar" aparece em `DownloadConcluido` → `DownloadCard` → `onInstall(shop, objectId)`

Isso chama `handleOpenGameInstaller(shop, objectId)` no hook `useInstallFlow()`.

### 6.2 Fluxo de Seleção de Proton

```
handleOpenGameInstaller(shop, objectId)
│
├── getInstalledProtonVersions()
│   └── Umu.getInstalledProtonVersions()
│       └── Escaneia diretórios:
│           ├── ~/.steam/steam/steamapps/common/Proton*
│           ├── ~/.steam/steam/compatibilitytools.d/
│           ├── /usr/share/steam/compatibilitytools.d/
│           └── userData/compat-tools/compatibilitytools.d/
│       └── Valida: pasta contém "proton" + "toolmanifest.vdf"
│
├── [Se NENHUM Proton instalado]
│   └── navigate("/proton-tools") → mostra página de instalação de Protons
│
├── [Se tem Protons instalados]
│   └── Mostra ProtonRecommendationModal
│       │
│       ├── Lista de Protons instalados (ProtonVersion[])
│       │   ├── Nome + versão
│       │   ├── Tier (Ouro/Prata/Bronze)
│       │   └── TierScore
│       │
│       └── Dois botões:
│           ├── "Usar este Proton" → handleSelectProton(protonPath)
│           └── "Baixar e Usar" → handleDownloadAndSelect(fork)
│
├── [handleSelectProton] ← Proton já instalado
│   └── window.electron.openGameInstaller(shop, objectId, protonPath)
│
└── [handleDownloadAndSelect] ← Baixar Proton
    ├── window.electron.downloadProton(fork)
    │   ├── findToolIdByForkName(fork)
    │   ├── getReleases(toolId) → cache em data/releases/
    │   └── downloadTool({ toolId, release })
    │       ├── downloadFile(url, dest)
    │       └── extractArchive(tar.xz/tar.gz/zip)
    │
    └── window.electron.openGameInstaller(shop, objectId, protonPath)
```

### 6.3 ProtonRecommendationModal

O modal mostra:
- **Protons instalados** — com nome, versão, tier, score
- **Botão "Baixar"** — para Protons que ainda não estão instalados
- **Botão "Recomendado"** — se o Python RPC retornou uma recomendação

O serviço de recomendação usa:
- `proton_data.db` (SQLite, ~280MB) para game matches
- `fork-analysis.json` para tierScore dos forks
- `gacha.py` para detecção de jogos gacha (+30 boost)
- `anticheat.py` para detecção de anti-cheat

---

## 7. Fase 5 — Criação do Prefixo Wine

### 7.1 O que é um Prefixo

Um prefixo Wine é um diretório que simula o ambiente Windows:
```
~/games/ProtonForger/<game_name>/
├── drive_c/
│   ├── windows/
│   │   ├── system32/
│   │   └── syswow64/
│   ├── Program Files/
│   └── users/
├── system.reg
├── user.reg
└── pfx/        ← (subprefixo criado pelo Proton)
    └── drive_c/
```

### 7.2 Setup do Prefixo

```
setupPrefix(gameId, protonPath, prefixPath)
│
├── Cria diretório se não existe
├── spawn umu-run wineboot -u
│   ├── Env: WINEPREFIX, PROTONPATH
│   └── Inicializa registro Windows
│
└── Retorna true/false
```

### 7.3 Criação do Prefixo com DLLs

```
createPrefixWithDlls(objectId, protonPath, winePrefixPath)
│
├── setupPrefix() → cria prefixo básico
└── ProtonRecommendationService.installGameDlls()
    └── Instala DLLs recomendadas (vcrun, d3dx9, etc.)
```

---

## 8. Fase 6 — Instalação do Jogo

### 8.1 installGame() — O Coração

Localização: `app/Games/services/game-launcher/install/install-game.ts`

```
installGame(sourcePath, options)
│
├── resolveActualPrefix() → resolve path real (pode ter /pfx/)
│
├── [Se já tem executablePath configurado] → MODO RESTORE
│   ├── Copia pasta para o prefixo via MakaiRPC
│   │   └── copy_to_prefix(source, prefix) → Python
│   │       └── Cópia com verificação SHA256
│   ├── Verifica hash pós-cópia
│   ├── scan_prefix_for_exes() → Python
│   └── Retorna candidates
│
├── [Se NOVO jogo] → detecta tipo
│   ├── MakaiRPC.call("detect_installer_type", { source_path })
│   │   └── Python: game_install.py :: detect_installer_type()
│   │       └── Analisa: extensão, conteúdo, se tem setup.exe
│   │
│   ├── [Se INSTALLER (.exe/.msi)]:
│   │   ├── snapshot_prefix() BEFORE → lista todos os arquivos drive_c/
│   │   ├── runInstallerInContainer(installerExe, protonPath, prefixPath)
│   │   │   ├── umu-run é um zipapp Python auto-contido
│   │   │   ├── Env: WINEPREFIX, PROTONPATH
│   │   │   ├── INSTALL_CLEAN_ENV (desativa DXVK, ESYNC, FSYNC, NVAPI)
│   │   │   └── spawn(detached: true) → processo isolado
│   │   ├── snapshot_prefix() AFTER
│   │   ├── find_new_executables(before, after) → Python
│   │   │   └── Compara snapshots, retorna .exe NOVOS
│   │   └── Retorna candidates[]
│   │
│   └── [Se PORTABLE (pasta)]:
│       ├── Validações: exe_count, total_files (< 50000)
│       ├── copy_to_prefix() via MakaiRPC → Python
│       │   ├── Calcula SHA256 pré-cópia (lotes de 20)
│       │   ├── Copia em lotes de 50 com shutil.copy2()
│       │   └── Verifica SHA256 pós-cópia
│       ├── scan_prefix_for_exes() → Python
│       │   ├── Escaneia drive_c/ por .exe jogáveis
│       │   ├── Pula: SYSTEM_DIRS, NEGATIVE_DIRS
│       │   ├── Ordena por tamanho (maior primeiro)
│       │   └── Limite: MAX_CANDIDATES = 5
│       └── Retorna candidates[]
│
└── Retorna InstallResult:
    { success, candidates[], suggested_dir, method }
```

### 8.2 Fluxo de Progresso

```
progress("analyzing", 5, "Analisando instalador...")
  ↓
progress("preparing", 10, "Instalador: setup.exe")
  ↓
progress("snapshot", 15, "Registrando estado do prefixo...")
  ↓
progress("installing", 30, "Executando instalador...")
  ↓
progress("scanning", 70, "Verificando novos arquivos...")
  ↓
progress("complete", 100, "2 executável(s) encontrado(s)")
```

Cada progresso é enviado ao renderer via:
```typescript
WindowManager.gameLauncherWindow?.webContents.send("preflight-progress", { status, detail, percent });
```

### 8.3 Modo "Instalação Limpa"

Durante a instalação, o Proton é configurado para NÃO usar:
- **DXVK** (tradução DirectX → Vulkan) — pode quebrar vídeos de instaladores
- **ESYNC/FSYNC** (sincronização) — pode causar problemas
- **NVAPI** (DLSS) — irrelevante durante instalação

```typescript
const INSTALL_CLEAN_ENV = {
  PROTON_NO_ESYNC: "1",
  PROTON_NO_FSYNC: "1",
  WINEESYNC: "0",
  WINEFSYNC: "0",
  PROTON_USE_WINED3D: "1",
  PROTON_DISABLE_DXVK: "1",
  PROTON_DISABLE_NVAPI: "1",
  PROTON_ENABLE_NVAPI: "0",
}
```

---

## 9. Fase 7 — Seleção de Executável

### 9.1 Quando aparece

Após `installGame()` retornar `candidates.length > 0`, o `openGameInstaller()` cria uma janela de seleção:

```
returnOrSelect()
│
├── [Se tem executável prévio E candidates]
│   └── Tenta auto-match por nome → se encontrar, usa direto
│
├── [Se candidates > 0]
│   └── WindowManager.createExecutableSelectWindow()
│       ├── candidates: [{ path, name, size }]
│       ├── suggestedDir
│       ├── prefixDriveCPath
│       └── gameTitle
│
└── [Se sem candidates]
    └── Retorna suggestedDir (abre file picker)
```

### 9.2 ExecutableCandidateModal

O modal mostra:
- Lista de executáveis encontrados (nome, tamanho)
- Botão "Procurar" → abre file picker
- Caminho do prefixo drive_c

### 9.3 Quando o usuário escolhe

```
handleExePicked(path)
│
├── window.electron.setGameExecutablePath(shop, objectId, path)
│   └── Salva no gamesStore: { executablePath: path }
│
├── setShowInstallSuccessModal(true)
│   └── "Instalação concluída! Ir para Games"
│
└── handleNavigateToGames()
    ├── updateLibrary()
    └── navigate("/games")
```

---

## 10. Fase 8 — Jogo na Aba Games

### 10.1 Como o jogo aparece

Após `setGameExecutablePath()`:
1. `gamesStore` é atualizado com `executablePath`
2. `updateLibrary()` recarrega a biblioteca
3. A aba Games carrega via `gamesService.getAll()`
4. O jogo aparece na seção "Local" com:
   - Imagem de capa
   - Título
   - Botão "Play"
   - Botão "Config"
   - Botão "Wine Tools"

### 10.2 Ações Disponíveis na Aba Games

```
ABA GAMES
│
├── GameCard (card do jogo)
│   ├── Imagem de capa
│   ├── Título
│   ├── Badge de status (instalado, cloud sync, etc.)
│   └── Clica → seleciona o jogo
│
├── GameBar (barra inferior)
│   ├── ▶️ Play → window.electron.openGame()
│   │   └── open-game.ts → launchGame()
│   │       └── spawn umu-run com o executável
│   ├── ⚙️ Config → GameConfigModal
│   │   ├── 10 abas de configuração
│   │   ├── Wine prefix path
│   │   ├── Proton path
│   │   ├── Launch options
│   │   ├── DLL overrides
│   │   ├── Winetricks verbs
│   │   ├── Cloud save
│   │   ├── Steam shortcut
│   │   ├── MangoHud
│   │   └── GameMode
│   ├── 🔧 Wine Tools
│   │   ├── Explorer (abrir drive_c)
│   │   ├── Regedit
│   │   ├── Winetricks
│   │   ├── Console (wine cmd)
│   │   └── Kill processes
│   ├── 📁 Backup
│   ├── 🗑️ Delete
│   ├── ⭐ Favoritar
│   └── 🔄 Cloud Sync
│
└── Seção Steam
    └── Jogos detectados automaticamente da Steam
```

### 10.3 launchGame() — O que acontece ao jogar

```
launchGame({ shop, objectId, executablePath, launchOptions })
│
├── [Se Steam] → launchGame direto
│
├── [Se Wine/Proton]
│   ├── Encontra Proton path
│   ├── monta comando:
│   │   umu-run <proton> <prefix> <executable> [launchOptions]
│   ├── Env vars:
│   │   WINEPREFIX, PROTONPATH, STORE, GAMEID
│   │   DXVK_HUD, MANGOHUD, etc.
│   └── spawn(detached: true)
│
└── Jogo inicia!
```

---

## 11. Sub-aba qBittorrent

### 11.1 O que é

A sub-aba "qBittorrent" embute a interface web do qBittorrent num `<webview>`:

```tsx
<webview
  src="http://localhost:8081"
  style={{ width: "100%", height: "100%" }}
  webpreferences="disablewebsecurity"
/>
```

### 11.2 QBittorrentClient

Localização: `app/_main/installer-api/ForgePipeline/services/download/qbittorrent-client.ts`

O cliente se conecta ao qBittorrent WebUI:
- **Host:** `http://localhost`
- **Porta:** `8081`
- **Auth:** `admin` / senha vazia
- **Categoria:** "ProtonForge"

### 11.3 API do qBittorrent usada

| Endpoint | Método | Uso |
|----------|--------|-----|
| `/api/v2/auth/login` | POST | Login (session cookie) |
| `/api/v2/torrents/info` | GET | Lista torrents |
| `/api/v2/torrents/add` | POST | Adiciona magnet |
| `/api/v2/torrents/start` | POST | Inicia torrent |
| `/api/v2/torrents/stop` | POST | Pausa torrent |
| `/api/v2/torrents/delete` | POST | Deleta torrent |

---

## 12. Arquivos Envolvidos — Mapeamento Completo

### 12.1 Renderer (React)

| Arquivo | Função |
|---------|--------|
| `app/Downloads/index.tsx` | Página principal Downloads |
| `app/Downloads/components/downloads-content.tsx` | Conteúdo: 3 grupos |
| `app/Downloads/components/download-group.tsx` | Grupo com hero + cards |
| `app/Downloads/components/download-ativo/download-ativo.tsx` | Hero do download ativo |
| `app/Downloads/components/download-parado/download-parado.tsx` | Cards de fila |
| `app/Downloads/components/download-concluido/download-concluido.tsx` | Cards concluídos |
| `app/Downloads/components/shared/download-card/download-card.tsx` | Card genérico |
| `app/Downloads/components/shared/speed-chart.tsx` | Gráfico de velocidade |
| `app/Downloads/components/downloads-modals.tsx` | Agrega todos os modais |
| `app/Downloads/hooks/useDownloadsLayout.ts` | Classifica library em grupos |
| `app/Downloads/hooks/useDownloadsGroup.ts` | Estado de cada grupo |
| `app/Downloads/utils/game-actions.ts` | Ações contextuais |
| `app/Downloads/utils/color-utils.ts` | Cores para gráficos |
| `app/_main/installer-api/ForgePipeline/ui/use-download.ts` | Hook principal de download |
| `app/_main/installer-api/ForgePipeline/ui/install-flow/use-install-flow.ts` | Fluxo de instalação |

### 12.2 Main Process (Electron)

| Arquivo | Função |
|---------|--------|
| `src/main/events/torrenting/start-game-download.ts` | Handler: iniciar download |
| `src/main/services/main-loop.ts` | Polling de downloads (2s) |
| `app/_main/installer-api/ForgePipeline/services/download/index.ts` | DownloadManager (classe central) |
| `app/_main/installer-api/ForgePipeline/services/download/qbittorrent-backend.ts` | Backend torrent |
| `app/_main/installer-api/ForgePipeline/services/download/qbittorrent-client.ts` | Cliente HTTP qBittorrent |
| `app/_main/installer-api/ForgePipeline/services/download/js-http-downloader.ts` | Downloader HTTP direto |
| `app/_main/installer-api/ForgePipeline/services/download/status/index.ts` | Status de downloads |
| `app/_main/installer-api/ForgePipeline/services/download/status/watcher.ts` | Watcher de downloads |
| `app/_main/installer-api/ForgePipeline/services/download/completion/index.ts` | Pós-download |
| `app/_main/installer-api/ForgePipeline/services/download/completion/extraction.ts` | Extração |
| `app/_main/installer-api/ForgePipeline/services/download/completion/update-status.ts` | Atualiza status |
| `app/_main/installer-api/ForgePipeline/services/download/completion/ui-update.ts` | Envia progresso UI |
| `app/_main/installer-api/ForgePipeline/services/download/queue.ts` | Fila de downloads |
| `app/_main/installer-api/ForgePipeline/services/download/download-seeding.ts` | Seeding |
| `app/_main/installer-api/ForgePipeline/services/download/helpers.ts` | Helpers |
| `app/_main/installer-api/ForgePipeline/services/download/types.ts` | Tipos |
| `app/_main/installer-api/ForgePipeline/services/game-files-manager.ts` | Gerenciador de arquivos |
| `app/_main/installer-api/ForgePipeline/events/open-game/open-game.ts` | Orquestrador Play |
| `app/_main/installer-api/ForgePipeline/events/open-game/ensure-proton.ts` | Garante Proton |
| `app/_main/installer-api/ForgePipeline/events/open-game/download-installer.ts` | Download do catálogo |
| `app/_main/installer-api/ForgePipeline/events/open-game/handle-prefix.ts` | Prefixo + scan |
| `app/_main/installer-api/ForgePipeline/events/open-game-installer.ts` | IPC: openGameInstaller |
| `app/_main/installer-api/ForgePipeline/events/extract-game-download.ts` | IPC: extrair download |
| `app/_main/installer-api/ForgePipeline/events/install-library.ts` | IPC: instalar DLLs |
| `app/Games/services/game-launcher/install/install-game.ts` | installGame() |
| `app/Games/services/game-launcher/install/types.ts` | Tipos de instalação |

### 12.3 Python (Backend)

| Arquivo | RPC Methods | Função |
|---------|-------------|--------|
| `app/Catalogo/GameMod/core/server.py` | 53+ métodos | Servidor RPC |
| `app/Catalogo/GameMod/core/game_install.py` | `detect_installer_type`, `copy_to_prefix`, `scan_prefix_for_exes`, `snapshot_prefix`, `find_new_executables`, `install_game` | Lógica de instalação |

---

## 13. Fluxo de Dados entre Camadas

```
┌─────────────────────────────────────────────────────────────┐
│                    RENDERER (React)                          │
│                                                             │
│  useDownload() ←── IPC ──→ on-download-progress             │
│  useInstallFlow() ←── IPC ──→ onInstallProgress             │
│  useDownloadsLayout() → classifica library                  │
│                                                             │
│  [Clique "Download"]                                        │
│    → window.electron.startGameDownload(payload)             │
│  [Clique "Instalar"]                                        │
│    → window.electron.openGameInstaller(shop, id, proton)    │
│  [Seleciona .exe]                                           │
│    → window.electron.setGameExecutablePath(shop, id, path)  │
└────────────────────────────┬────────────────────────────────┘
                             │ IPC (invoke)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                  MAIN PROCESS (Electron)                     │
│                                                             │
│  DownloadManager (singleton)                                │
│    ├── startDownload() → escolhe backend                    │
│    ├── watchDownloads() → polling 2s                        │
│    ├── pauseDownload() / resumeDownload()                   │
│    └── completeDownload() → extração                        │
│                                                             │
│  downloadsStore (LevelDB)                                   │
│    key: "steam:12345" → { uri, status, progress, ... }     │
│                                                             │
│  gamesStore (LevelDB)                                       │
│    key: "steam:12345" → { title, executablePath, ... }     │
│                                                             │
│  QBittorrentClient → http://localhost:8081                  │
│  JsHttpDownloader → stream HTTP                             │
│                                                             │
│  openGameInstaller() → setupPrefix() + installGame()        │
│                                                             │
│  MakaiRPC.call(method, params) ──────────────────────┐      │
│                                                      │      │
└──────────────────────────────────────────────────────│──────┘
                                                       │ JSON-lines
                                                       │ stdin/stdout
                                                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     PYTHON (server.py)                       │
│                                                             │
│  detect_installer_type(source_path)                         │
│  copy_to_prefix(source_path, prefix_path)                   │
│  scan_prefix_for_exes(prefix_path)                          │
│  snapshot_prefix(prefix_path)                               │
│  find_new_executables(before, after)                        │
│  install_game(source, prefix, proton, ...)                  │
│                                                             │
│  └── game_install.py (628 linhas)                           │
│      ├── Cópia com SHA256                                   │
│      ├── Scan de executáveis                                │
│      ├── Snapshot + diff                                    │
│      └── Detecção de instalador vs portátil                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 14. Pontos de Atenção e Possíveis Problemas

### 14.1 Download não inicia
- Verificar se qBittorrent está rodando na porta 8081
- Verificar se o URI/magnet está válido
- Verificar logs: `logger.log("[Downloads] Start requested for...")`

### 14.2 Extração falha
- Arquivo pode estar corrompido
- Senha pode estar errada (senhas testadas: "online-fix.me", "steamrip.com")
- Arquivo pode ser .exe (não precisa extração — fica como "CONCLUÍDO" direto)

### 14.3 Instalação falha
- **Proton não encontrado**: navega para /proton-tools
- **Prefixo não criado**: verificar se umu-run está acessível
- **Instalador não produz executáveis**: pode ser NSIS que precisa de interação
- **Cópia SHA256 divergente**: arquivo corrompido na cópia

### 14.4 Executável não aparece na aba Games
- Verificar se `executablePath` foi salvo no gamesStore
- Verificar se `updateLibrary()` foi chamado
- Verificar se o jogo não foi deletado acidentalmente

### 14.5 qBittorrent webview não carrega
- Verificar se qBittorrent está rodando
- Verificar porta 8081 (pode estar em uso)
- webview com `disablewebsecurity` pode ter issues de CORS

---

## Anexo A — Glossário

| Termo | Significado |
|-------|-------------|
| **DownloadManager** | Classe singleton que gerencia todos os downloads |
| **QBittorrentBackend** | Backend para downloads torrent via qBittorrent |
| **JsHttpDownloader** | Backend para downloads HTTP direto (Node.js) |
| **downloadsStore** | Armazenamento LevelDB de downloads |
| **gamesStore** | Armazenamento LevelDB de jogos |
| **gameKey** | Chave do store: `game(shop, objectId)` ex: `"steam:12345"` |
| **prefix/prefixo** | Diretório Wine que simula ambiente Windows |
| **umu-run** | Binário para executar Proton sem Steam |
| **MakaiRPC** | Bridge JSON-lines entre Electron e Python |
| **ForgePipeline** | Mapeado para `app/_main/installer-api/ForgePipeline/` |
| **MakaiTricks** | Winetricks customizado para instalação de DLLs |
| **Seeding** | Compartilhar arquivos baixados via torrent |
| **extracting** | Estado de extração em andamento |
| **folderName** | Nome da pasta/arquivo baixado (atualizado pós-extração) |
| **candidates** | Lista de executáveis encontrados após instalação |
| **GameFilesManager** | Gerencia extração,绑ção de executável, limpeza |
| **InstallProgress** | Objeto de progresso: { status, percent, gameTitle } |
| **PROTON_NO_ESYNC** | Env var que desativa ESYNC durante instalação |
| **drive_c/** | Raiz do filesystem Windows dentro do prefixo |
| **snapshot** | Lista completa de arquivos drive_c/ (antes/depois de instalador) |

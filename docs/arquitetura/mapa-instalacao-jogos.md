# ProtonForge — Mapeamento Completo da Arquitetura e Fluxos

> **Propósito deste documento:** Registrar todo o conhecimento sobre o funcionamento interno do ProtonForge para que qualquer desenvolvedor possa dar manutenção, estender ou reconstruir o projeto do zero. Aqui você encontra o caminho de cada arquivo, a função de cada função, o fluxo de cada evento IPC, a lógica de cada serviço, e as correções de bugs já aplicadas.

---

## Índice

1. [Estrutura do Projeto](#1-estrutura-do-projeto)
2. [Ciclo de Vida de um Jogo](#2-ciclo-de-vida-de-um-jogo)
3. [Fluxo de Download de Jogos](#3-fluxo-de-download-de-jogos)
4. [Sistema de Recomendação de Proton](#4-sistema-de-recomendação-de-proton)
5. [Fluxo de Instalação Passo a Passo](#5-fluxo-de-instalação-passo-a-passo)
6. [Gerenciamento de Proton Tools](#6-gerenciamento-de-proton-tools)
7. [Criação de Prefixo Wine](#7-criação-de-prefixo-wine)
8. [Instalação de DLLs com Winetricks](#8-instalação-de-dlls-com-winetricks)
9. [Execução de Jogos com umu-run](#9-execução-de-jogos-com-umu-run)
10. [API Python (protonforge-api)](#10-api-python-protonforge-api)
11. [Banco de Dados](#11-banco-de-dados)
12. [Eventos IPC — Mapeamento Completo](#12-eventos-ipc--mapeamento-completo)
13. [Camada Preload](#13-camada-preload)
14. [Camada Renderer (React)](#14-camada-renderer-react)
15. [Variáveis de Ambiente e Launch Options](#15-variáveis-de-ambiente-e-launch-options)
16. [Análise de Executáveis com CompatFlow](#16-análise-de-executáveis-com-compatflow)
17. [Tratamento de Erros e Logs](#17-tratamento-de-erros-e-logs)
18. [Histórico de Bugs Corrigidos](#18-histórico-de-bugs-corrigidos)
19. [Como Compilar e Executar](#19-como-compilar-e-executar)

---

## 1. Estrutura do Projeto

```
protonforgerfull/
│
├── src/
│   ├── main/                          ← Processo principal Electron (Node.js)
│   │   ├── main.ts                    ← Entry point do Electron (cria janela, menus, etc.)
│   │   ├── constants.ts               ← Constantes (paths, configurações)
│   │   │
│   │   ├── events/                    ← Handlers IPC (cada arquivo = 1+ eventos)
│   │   │   ├── register-event.ts      ← Utilitário para registrar eventos IPC
│   │   │   │
│   │   │   ├── catalogue/             ← Eventos do catálogo de jogos
│   │   │   │   ├── index.ts           ← getGames, getGameById, getGameShopDetails
│   │   │   │   ├── get-game-assets.ts ← Busca imagens, vídeos do jogo
│   │   │   │   └── search-games.ts    ← Busca textual no catálogo
│   │   │   │
│   │   │   ├── library/              ← Eventos da biblioteca do usuário
│   │   │   │   ├── add-game-to-library.ts
│   │   │   │   ├── remove-game-from-library.ts
│   │   │   │   ├── open-game-installer.ts      ← ORQUESTRADOR DA INSTALAÇÃO
│   │   │   │   ├── set-game-executable-path.ts ← Salva .exe escolhido
│   │   │   │   ├── install-game-folder.ts
│   │   │   │   ├── get-installed-proton-versions.ts
│   │   │   │   ├── create-game-shortcut.ts
│   │   │   │   ├── create-steam-shortcut.ts
│   │   │   │   ├── open-game-winetricks.ts
│   │   │   │   ├── open-game-wine-prefix.ts
│   │   │   │   ├── launch-game.ts
│   │   │   │   ├── close-game.ts
│   │   │   │   └── set-game-title.ts
│   │   │   │
│   │   │   ├── downloads/             ← Eventos de download
│   │   │   │   ├── start-download.ts  ← Inicia download (torrent/direct)
│   │   │   │   ├── pause-download.ts
│   │   │   │   ├── cancel-download.ts
│   │   │   │   ├── get-download-info.ts
│   │   │   │   └── extract-game.ts
│   │   │   │
│   │   │   ├── proton/               ← Eventos de Proton
│   │   │   │   ├── index.ts          ← Registra TODOS os eventos de Proton
│   │   │   │   ├── install-game-with-proton.ts ← downloadProton (IPC handler)
│   │   │   │   ├── recommend-proton.ts          ← recommendProton
│   │   │   │   └── analyze-game-exe.ts          ← analyzeGameExe
│   │   │   │
│   │   │   ├── auth/                 ← Autenticação
│   │   │   ├── cloud-save/           ← Cloud saves
│   │   │   ├── achievements/         ← Conquistas
│   │   │   └── misc/                 ← Diversos (atualização, telemetria)
│   │   │
│   │   ├── services/                 ← Lógica de negócio (sem Electron)
│   │   │   ├── index.ts              ← Re-exporta todos os serviços
│   │   │   ├── logger.ts             ← electron-log configurado
│   │   │   │
│   │   │   ├── proton/               ← Gerenciamento de Proton
│   │   │   │   ├── index.ts          ← downloadTool, getReleases, getInstalledTools
│   │   │   │   ├── tools.ts          ← PROTON_TOOLS (19 ferramentas), findToolIdByForkName
│   │   │   │   ├── manager.ts        ← Facade ProtonManager
│   │   │   │   ├── downloader.ts     ← downloadFile via axios streaming
│   │   │   │   ├── extractor.ts      ← extractArchive (tar.xz, tar.gz, zip)
│   │   │   │   ├── installer.ts      ← getInstalledTools, getInstallDir
│   │   │   │   ├── types.ts          ← Interfaces ProtonTool, ProtonRelease, etc.
│   │   │   │   └── tools/            ← Definições individuais de cada ferramenta
│   │   │   │       ├── index.ts      ← findToolByFolder, formatDirName
│   │   │   │       ├── proton-ge.ts
│   │   │   │       ├── proton-cachyos.ts
│   │   │   │       ├── dw-proton.ts
│   │   │   │       └── ...
│   │   │   │
│   │   │   ├── wine.ts               ← Wine.getEffectivePrefixPath
│   │   │   ├── umu.ts                ← Umu.launchInstaller, .launchExecutable
│   │   │   ├── system-path.ts        ← SystemPath (caminhos do SO)
│   │   │   ├── github.ts             ← fetchReadme (GitHub API)
│   │   │   ├── venv.ts               ← Gerenciamento do virtualenv Python
│   │   │   ├── window-manager.ts     ← Controle de janelas Electron
│   │   │   ├── process-watcher.ts    ← Monitor de processos
│   │   │   ├── cloud-sync.ts         ← Sincronização na nuvem
│   │   │   ├── torrent-client.ts     ← Interface com qBittorrent
│   │   │   ├── python-rpc.ts         ← Ponte JSON-RPC para Python
│   │   │   └── proton-recommendation.ts ← Serviço de recomendação (chama API Python)
│   │   │
│   │   ├── install-flow/             ← Orquestração da instalação
│   │   │   ├── orchestrator.ts       ← installAndScan (ponto central)
│   │   │   ├── prefix-setup.ts       ← setupPrefix (cria prefixo Wine com umu-run)
│   │   │   ├── runner.ts             ← runInstaller / runExecutable
│   │   │   ├── prefix-copier.ts      ← copyFolderToPrefix
│   │   │   ├── snapshot.ts           ← takeSnapshot do drive_c
│   │   │   ├── change-detector.ts    ← findNewExecutables
│   │   │   ├── prefix-scanner.ts     ← scanPrefixForExes
│   │   │   ├── candidate-formatter.ts ← formatCandidates
│   │   │   ├── source-resolver.ts    ← getSourceFolder
│   │   │   ├── progress.ts           ← sendInstallProgress, sendInstallLog
│   │   │   └── types.ts             ← InstallOptions, InstallResult
│   │   │
│   │   ├── store/                    ← Banco de dados
│   │   │   ├── index.ts             ← Instância Level, sublevels
│   │   │   └── sublevels/           ← Subníveis (games, downloads, settings, etc.)
│   │   │
│   │   ├── helpers/                  ← Funções auxiliares
│   │   │   ├── find-exe-in-folder.ts
│   │   │   ├── format-game-dir-name.ts
│   │   │   ├── resolve-launch-command.ts
│   │   │   └── ...
│   │   │
│   │   └── generated/               ← Código gerado (protobuf)
│   │
│   ├── renderer/                     ← Interface React (frontend)
│   │   └── src/
│   │       ├── App.tsx              ← Componente raiz
│   │       ├── main.tsx             ← Entry point React
│   │       ├── pages/               ← Páginas da aplicação
│   │       │   ├── home/
│   │       │   │   ├── proton-tools.tsx          ← Página de Proton Tools
│   │       │   │   └── proton-tools/             ← Versão modular
│   │       │   │       ├── index.tsx
│   │       │   │       ├── tools/index.ts
│   │       │   │       ├── version-list.tsx
│   │       │   │       ├── download-progress.tsx
│   │       │   │       └── proton-info-modal.tsx
│   │       │   ├── game/
│   │       │   │   └── game-details.tsx
│   │       │   ├── library/
│   │       │   │   └── library.tsx
│   │       │   └── ...
│   │       ├── hooks/               ← Hooks React
│   │       │   ├── use-install-flow.ts  ← FLUXO DE INSTALAÇÃO (React)
│   │       │   ├── use-library.ts
│   │       │   └── ...
│   │       └── declaration.d.ts    ← Tipos da API window.electron.*
│   │
│   ├── preload/                     ← Ponte entre renderer e main
│   │   ├── index.ts                 ← contextBridge (expõe api para renderer)
│   │   └── app.ts                   ← Definição da API (window.electron.*)
│   │
│   └── types/                       ← Tipos TypeScript compartilhados
│       ├── index.ts                 ← ProtonFork, ProtonVersion, GameShop, etc.
│       └── ...
│
├── protonforge-api/                 ← API Python (recomendação + prefixo)
│   ├── server.py                    ← Servidor JSON-RPC stdin/stdout
│   ├── api/
│   │   ├── __init__.py              ← Re-export das funções principais
│   │   ├── handler.py               ← Dispatcher RPC (registro de métodos)
│   │   ├── db/
│   │   │   └── connection.py        ← Conexões SQLite
│   │   └── services/
│   │       ├── recommendation/      ← Motor de recomendação
│   │       │   ├── core.py          ← Algoritmo de recomendação
│   │       │   ├── matching.py      ← Queries SQLite de game matching
│   │       │   └── options.py       ← Launch options
│   │       ├── prefix/              ← Gerenciamento de prefixo
│   │       │   ├── core.py          ← create_prefix, delete_prefix
│   │       │   └── winetricks.py    ← Instalação de DLLs
│   │       ├── launch_args/         ← Launch arguments
│   │       │   ├── core.py          ← build_launch_command
│   │       │   └── catalog.py       ← Catálogo de args comuns
│   │       ├── catalog.py           ← Consultas ao catálogo de jogos
│   │       ├── dlls.py              ← Catálogo de DLLs
│   │       ├── gacha.py             ← Detecção de jogos gacha
│   │       ├── anticheat.py         ← Detecção de anti-cheat
│   │       ├── compatflow_bridge.py ← Ponte para CompatFlow
│   │       ├── proton_versions.py   ← Detecção de Protons instalados
│   │       └── data.py              ← Cache de JSON
│   ├── scripts/
│   │   └── migrate_to_sqlite.py    ← Migração JSON → SQLite
│   └── tests/                      ← Testes Python
│       ├── test_recommendation.py
│       └── test_prefix.py
│
├── app/_resources/                  ← Runtime binaries
│   ├── binaries/
│   │   ├── umu-run                 ← Binário umu (execução de Proton)
│   │   └── ...                     ← Outros binários (7z, etc.)
│   ├── chrome/                     ← Chromium (~381 MB)
│   ├── extensions/                 ← UltraSurf VPN, UltraWelcome
│   ├── native/                     ← ProtonForge native Rust addon
│   └── python/                     ← wine_log.py, wine_log_gui.py
│
├── app/_assets/                     ← UI assets
│   ├── backgrounds/
│   ├── audio/
│   └── assets/icons/
│
├── app/_data/                       ← Bancos + manifests
│   ├── proton_data.db              ← (281 MB)
│   ├── fork_catalog.db             ← (4.9 MB)
│   ├── supplemental.db             ← (50 MB)
│   ├── resonance.json
│   ├── catalogs/                    ← Análises de forks, compatibilidade
│   │   ├── fork-analysis.json       ← Score e tier de cada fork
│   │   ├── game-forks-all-raw.json
│   │   ├── game-forks-compat.json
│   │   ├── game-forks-compat-enriched.json
│   │   ├── game-forks-unmatched.json
│   │   └── game-mentions-raw.json
│   ├── releases/                    ← Cache de releases (JSON por tool)
│   └── logs/                        ← Logs de execução
│
├── protonforge.desktop             ← Atalho .desktop
├── package.json                    ← Dependências Node.js
├── electron.vite.config.ts         ← Configuração do Vite para Electron
├── tsconfig.json                   ← Configuração TypeScript
├── yarn.lock                       ← Lockfile Yarn
└── start.sh                        ← Script de inicialização
```

---

## 2. Ciclo de Vida de um Jogo

```
DESCOBERTA → DOWNLOAD → INSTALAÇÃO → EXECUÇÃO → (opcional) REMOÇÃO
```

### 2.1 Descoberta

O usuário encontra jogos de três formas:

1. **Catálogo interno** (`catalogo.db`): busca por nome, gênero, etc. Os eventos IPC envolvidos:
   - `searchGames(query)` → `src/main/events/catalogue/search-games.ts`
   - `getGameById(id)` → `src/main/events/catalogue/index.ts`
   - `getGameShopDetails(shop, objectId)` → `src/main/events/catalogue/index.ts`

2. **Adição manual**: o usuário pode adicionar um jogo customizado (qualquer `.exe`):
   - `addGameToLibrary(shop, objectId, title)` → `src/main/events/library/add-game-to-library.ts`

3. **Descoberta externa**: o ProtonForge também consulta lojas como Steam (via ProtonDB) para obter informações de compatibilidade.

### 2.2 Adição à Biblioteca

Quando um jogo é adicionado à biblioteca, estes campos são salvos no armazenamento (`gamesStore`):

```typescript
// gamesStore key = game(shop, objectId)
interface Game {
  shop: 'steam' | 'custom' | 'epic' | etc.
  objectId: string
  title: string
  executablePath?: string       // Só após instalação
  winePrefixPath?: string       // Só após instalação
  protonPath?: string           // Proton selecionado
  protonVersion?: string
  enableEac?: boolean
  enableBattlEye?: boolean
  download?: DownloadInfo       // Info do download ativo/completo
  playTimeInMilliseconds: number
  lastTimePlayed: number | null
  isDeleted: boolean
}
```

O banco de dados fica em `userData/stores/`.

### 2.3 Download

Ver seção [3. Fluxo de Download de Jogos](#3-fluxo-de-download-de-jogos).

### 2.4 Instalação

Ver seção [5. Fluxo de Instalação Passo a Passo](#5-fluxo-de-instalação-passo-a-passo).

### 2.5 Execução

Ver seção [9. Execução de Jogos com umu-run](#9-execução-de-jogos-com-umu-run).

---

## 3. Fluxo de Download de Jogos

O ProtonForge gerencia downloads via **fontes** (sources). Cada jogo pode ter múltiplas fontes de download: torrent, direct link, Gofile, Pixeldrain, etc.

### 3.1 Estrutura de Download

```
downloadsStore (armazenamento)
  key: game(shop, objectId)
  value: {
    uri: "https://pixeldrain.com/u/abc123",
    downloadPath: "/home/cas/Downloads",
    folderName: "slutia-rpg-0.0.6-windows",
    status: "downloading" | "complete" | "paused" | "error",
    progress: 0.75,
    bytesDownloaded: 150000000,
    fileSize: 200000000,
    downloader: 1,           // 1=aria2, 2=qBittorrent, 3=direct
    shouldSeed: true,
    extracting: false,
    automaticallyExtract: true,
    automaticallyDeleteArchiveFiles: false,
    ...
  }
```

### 3.2 Gerenciamento de Downloads

**Arquivos envolvidos:**

| Arquivo | Função |
|---------|--------|
| `src/main/events/downloads/start-download.ts` | Inicia download (escolhe downloader) |
| `src/main/events/downloads/pause-download.ts` | Pausa download |
| `src/main/events/downloads/cancel-download.ts` | Cancela e limpa arquivos |
| `src/main/events/downloads/get-download-info.ts` | Retorna progresso |
| `src/main/events/downloads/extract-game.ts` | Extrai arquivos baixados |
| `src/main/services/download/js-http-downloader.ts` | Download HTTP direto |
| `src/main/services/torrent-client.ts` | Interface com qBittorrent |

### 3.3 Downloaders Disponíveis

O sistema suporta múltiplos downloaders, configuráveis nas Settings:

| Downloader | ID | Uso |
|------------|----|-----|
| **Nimbus** | 1 | Download HTTP direto (aria2) |
| **qBittorrent** | 2 | Torrent via qBittorrent WebUI |
| **Real-Debrid** | 3 | Download via Real-Debrid API |
| **Premiumize** | 4 | Download via Premiumize |
| **AllDebrid** | 5 | Download via AllDebrid |
| **TorBox** | 6 | Download via TorBox |
| **Gofile** | 7 | Download via Gofile API |

### 3.4 Pós-Download

Quando o download completa:

1. Se `automaticallyExtract` = `true`:
   - Chama `extractGame(shop, objectId)` em `src/main/events/downloads/extract-game.ts`
   - Extrai o arquivo baixado para a pasta de destino
   - Atualiza o status do download para `complete`

2. Se `automaticallyDeleteArchiveFiles` = `true`:
   - Remove o arquivo `.zip`/`.rar`/`.7z` original
   - Mantém apenas a pasta extraída

3. A pasta extraída fica em `downloadPath/folderName/`.
   Este path é usado depois por `openGameInstaller()` para encontrar os arquivos.

---

## 4. Sistema de Recomendação de Proton

### 4.1 Visão Geral

O sistema de recomendação é um **serviço Python** (`protonforge-api/`) que se comunica com o Electron via **JSON-RPC sobre stdin/stdout**. Quando o usuário clica em "Instalar" em um jogo, o Electron:

1. Envia um RPC `recommend_proton(game_id)` para o serviço Python
2. O Python consulta `proton_data.db` (SQLite, ~280MB) para encontrar forks recomendados
3. O Python retorna um JSON com:
   - `primary`: o melhor fork (maior tierScore)
   - `alternatives`: lista de forks alternativos
   - `launch_options`: env vars, DLLs, winetricks
4. O Electron mostra essas opções ao usuário em um modal

### 4.2 Arquitetura da Recomendação

```
Electron (main)                     Python (protonforge-api)
     │                                      │
     │  JSON-RPC stdin/stdout               │
     │─────────────────────────────────────>│
     │                                      │
     │  recommend_proton("1245620")         │
     │─────────────────────────────────────>│
     │                                      │
     │                               handler.py: dispatch()
     │                                   │
     │                               recommendation/core.py: recommend()
     │                                   │
     │                               ┌── matching.py: busca game_matches
     │                               │   + fork_recommendations no SQLite
     │                               │
     │                               ├── Se achar matches:
     │                               │   Consulta fork-analysis.json
     │                               │   Aplica tierScore
     │                               │   Ordena por score
     │                               │
     │                               ├── Se NÃO achar:
     │                               │   Usa tierScore genérico dos forks
     │                               │   Aplica boost se for jogo gacha
     │                               │   Aplica boost se tiver anti-cheat
     │                               │
     │                               └── options.py: gera launch_options
     │                                      │
     │  {primary, alternatives,              │
     │   launch_options}                     │
     │<─────────────────────────────────────│
     │                                      │
     │  ProtonRecommendationService.ts       │
     │  mostra modal para o usuário         │
```

### 4.3 Dados dos Forks (fork-analysis.json)

Cada fork de Proton tem uma análise completa em `data/catalogs/fork-analysis.json`:

```json
{
  "dw-proton": {
    "name": "DW-Proton",
    "tier": "silver",
    "tierScore": 56.8,
    "confidence": "genérico",
    "features": {
      "wayland": { "supported": true },
      "fsr": { "supported": true, "version": "3.0" },
      "dxvk-async": { "supported": true },
      "ntsync": { "supported": true }
    },
    "featureCount": 9,
    "gamesMatched": 5
  }
}
```

Tabela completa dos forks e seus scores:

| Fork | Tier | TierScore | Features |
|------|------|-----------|----------|
| GE-Proton | Ouro | 100.0 | wayland, fsr, fsync, ntsync, dxvk-async, nvapi, dlss, ... |
| Valve Proton | Ouro | 97.7 | oficial Steam |
| Proton-CachyOS | Prata | 68.5 | otimizado para Arch/CachyOS |
| Proton-EM | Prata | 63.8 | FSR4, wayland |
| DW-Proton | Prata | 56.8 | game fixes, nvapi |
| Proton-TKG | Prata | 52.2 | custom builds |
| Proton-GE-RTSP | Prata | 45.2 | codecs VRChat |
| Luxtorpeda | Prata | 41.7 | engines nativos Linux |
| Boxtron | Bronze | 20.5 | DOSBox adapter |
| Roberta | Experimental | 8.0 | ScummVM adapter |

### 4.4 Processo de Recomendação Detalhado

O arquivo `protonforge-api/api/services/recommendation/core.py` implementa o algoritmo:

```
recommend(game_id):
│
├── 1. Busca game_matches em proton_data.db
│    (tabela: game_matches, colunas: game_id, fork_id, version, confidence)
│
├── 2. Se encontrou matches:
│    ├── Carrega fork-analysis.json
│    ├── Para cada fork matchado:
│    │   ├── Pega tierScore do fork-analysis
│    │   ├── Ajusta score baseado em confidence do match
│    │   └── Se jogo for gacha: +30 no score
│    ├── Ordena por score decrescente
│    └── Retorna primary + alternatives
│
├── 3. Se NÃO encontrou matches:
│    ├── Carrega fork-analysis.json completo
│    ├── Para cada fork:
│    │   ├── Usa tierScore genérico
│    │   ├── Se jogo tiver anti-cheat (battleye/eac):
│    │   │   Prioriza forks com suporte a anti-cheat
│    │   └── Se jogo for gacha:
│    │       Prioriza DW-Proton e Proton-CachyOS (+30 boost)
│    └── Ordena por score decrescente
│
└── 4. Gera launch_options:
    ├── Env vars recomendadas (ex: PROTON_ENABLE_NVAPI=1)
    ├── DLLs recomendadas (ex: vcrun2022, d3dcompiler_47)
    └── Winetricks recomendados
```

### 4.5 Detecção de Jogos Gacha

O módulo `gacha.py` detecta jogos gacha (Genshin Impact, Honkai Star Rail, Zenless Zone Zero, Wuthering Waves, etc.) e aplica tratamento especial:

```python
# Mapa de IDs reconhecidos:
_GACHA_MAP = {
    "genshin_impact": {...},
    "honkai_star_rail": {...},
    "zenless_zone_zero": {...},  # também 4162040
    "wuthering_waves": {...},    # também 3513350
    "tower_of_fantasy": {...},  # também 2064650
    "neverness_to_everness": {...},  # também 3040220
}
```

Jogos gacha recebem **boost de +30 no tierScore** para DW-Proton e Proton-CachyOS, porque esses forks têm patches específicos para navegadores embarcados (CEF/Chromium) que esses jogos usam.

### 4.6 Detecção de Anti-Cheat

O módulo `anticheat.py` carrega `anticheat.json` e verifica se o jogo usa EasyAntiCheat ou BattlEye:

```python
def check_anticheat(game_id: str) -> dict:
    ac_data = _get_anticheat_rec(game_id)
    if not ac_data:
        return {"eac": False, "battleye": False}
    return {
        "eac": "easyanticheat" in raw or "eos" in raw,
        "battleye": "battleye" in raw,
    }
```

Jogos com anti-cheat recebem recomendações específicas (Proton Experimental, GE-Proton) em vez do tierScore genérico.

### 4.7 Como o Electron se Conecta à API Python

O arquivo `src/main/services/proton-recommendation.ts` gerencia o ciclo de vida do processo Python:

```typescript
class ProtonRecommendationService {
  private static process: ChildProcess | null = null;

  static async start(): Promise<void> {
    // Inicia server.py como processo filho
    // Comunicação via stdin/stdout com JSON-RPC
  }

  static async recommend(gameId: string): Promise<ProtonRecommendation> {
    // Envia: {"id":1,"method":"recommend_proton","params":{"game_id": gameId}}
    // Recebe: {"id":1,"result":{...}}
  }

  static async analyzeExe(exePath: string): Promise<any> {
    // Envia: {"id":2,"method":"analyze_exe","params":{"exe_path": exePath}}
  }

  static async checkAntiCheat(gameId: string): Promise<any> {
    // Envia: {"id":3,"method":"check_anticheat","params":{"game_id": gameId}}
  }
}
```

### 4.8 Dados da API (Diretório Externo)

Os dados da API Python ficam em `/home/cas/Documentos/protonforgerfull/tools/plaina_proton/api proton/`:

```
tools/plaina_proton/api proton/
├── protons.json              ← Definições dos forks de Proton
├── matched.json              ← Game matches (1.7M+ entradas)
├── anticheat.json            ← Jogos com anti-cheat
├── gacha_navegador_chromium.json  ← Jogos gacha
├── prefixo_dlls.json         ← DLLs e winetricks
├── launch_args.json          ← Launch arguments (68 args)
├── recommendations/          ← Recomendações por fork (10 arquivos .json)
├── anchors.json
├── compat.json
├── community.json
├── fork_launch_arg_mentions.json
├── game_launch_args.json
├── index.json
├── tier_stats.json
├── unmatched.json
└── README.md
```

---

## 5. Fluxo de Instalação Passo a Passo

### 5.1 Diagrama Completo

```
┌─────────────────────────────────────────────────────────────────────────┐
│ USUÁRIO                        RENDERER                    MAIN       │
│                                                                         │
│ [Biblioteca]                                                           │
│   │                                                                     │
│   ├── clica "Instalar" no jogo                                         │
│   │                                                                     │
│   ▼                                                                     │
│ handleOpenGameInstaller(shop, objectId)  ──────────────────────────►   │
│   │                              use-install-flow.ts:169              │
│   │                              │                                   │
│   │                              ├── getInstalledProtonVersions()     │
│   │                              │   ──────────────────────────────►  │
│   │                              │   │ Umu.getInstalledProtonVersions │
│   │                              │   │ umu.ts:110                     │
│   │                              │   │ ┌ Escaneia:                    │
│   │                              │   │ │ ~/.steam/steam/steamapps/    │
│   │                              │   │ │   common/Proton*             │
│   │                              │   │ │ ~/.steam/steam/              │
│   │                              │   │ │   compatibilitytools.d/      │
│   │                              │   │ │ /usr/share/steam/            │
│   │                              │   │ │   compatibilitytools.d/      │
│   │                              │   │ │ userData/compat-tools/       │
│   │                              │   │ │   compatibilitytools.d/      │
│   │                              │   │ └ Valida: proton +             │
│   │                              │   │   toolmanifest.vdf             │
│   │                              │◄── retorna ProtonVersion[]        │
│   │                              │                                   │
│   │                              ├── Mostra MODAL com opções         │
│   │◄─────────────────────────────│   de Proton + score de cada       │
│   │                              │                                   │
│   ├── seleciona Proton           │                                   │
│   │                              │                                   │
│   │          ┌── JÁ INSTALADO? ──┤                                   │
│   │          │                   │                                   │
│   │          ▼ SIM               │                                   │
│   │ handleSelectProton(path)     │                                   │
│   │   │─────────────────────────►│                                   │
│   │   │                          ├── openGameInstaller()             │
│   │   │                          │                                   │
│   │          ▼ NÃO               │                                   │
│   │ handleDownloadAndSelect(fork)│                                   │
│   │   │─────────────────────────►│                                   │
│   │   │                          ├── downloadProton(fork)            │
│   │   │                          │   ├── findToolIdByForkName()     │
│   │   │                          │   ├── getReleases()               │
│   │   │                          │   ├── downloadTool() → path      │
│   │   │                          ├── openGameInstaller(path)        │
│   │   │                          │                                   │
│   │   │                          ▼                                   │
│   │   │              openGameInstaller(shop, objectId,               │
│   │   │                protonPath, gameTitle)                        │
│   │   │              ───────────────────────────────────────►        │
│   │   │                                         open-game-           │
│   │   │                                         installer.ts:29      │
│   │   │                                                              │
│   │   │              ┌──────────────────────────────────────────┐    │
│   │   │              │  1. Wine.getEffectivePrefixPath()        │    │
│   │   │              │     ~/games/ProtonForger/<game_name>/    │    │
│   │   │              │                                          │    │
│   │   │              │  2. setupPrefix(gameId, protonPath,      │    │
│   │   │              │       winePrefixPath)                     │    │
│   │   │              │     ├── prefix-setup.ts:36               │    │
│   │   │              │     ├── Verifica se prefixo já existe    │    │
│   │   │              │     ├── Se não: umu-run wineboot -u      │    │
│   │   │              │     └── Aguarda drive_c + system.reg     │    │
│   │   │              │                                          │    │
│   │   │              │  3. findGameFolder(gameTitle)            │    │
│   │   │              │     Busca em ~/Downloads/ por pasta      │    │
│   │   │              │     que contenha o título do jogo        │    │
│   │   │              │                                          │    │
│   │   │              │  4. SE achou pasta:                      │    │
│   │   │              │     ├── .exe único → installAndScan()    │    │
│   │   │              │     ├── setup.exe → installAndScan()     │    │
│   │   │              │     └── scan folders → candidates[]      │    │
│   │   │              │                                          │    │
│   │   │              │  5. SE NÃO achou:                        │    │
│   │   │              │     └── Retorna suggestedDir             │    │
│   │   │              │         (prefixo já criado!)             │    │
│   │   │              └──────────────────────────────────────────┘    │
│   │   │                                                              │
│   │   │◄── InstallResult                                             │
│   │   │                                                              │
│   │   ▼                                                              │
│   │  InstallResult.candidates                                        │
│   │  ├── [] vazio → handleOpenExePicker()                            │
│   │  │              Usuário escolhe .exe manualmente                 │
│   │  │              → setGameExecutablePath()                        │
│   │  │                                                              │
│   │  └── com candidatos → Mostra modal                              │
│   │                   Usuário confirma .exe                          │
│   │                   → handleExePicked(path)                       │
│   │                                                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 O Que Acontece Dentro de installAndScan()

```typescript
// orchestrator.ts:15
async function installAndScan(filePath, options) {
  // 1. SETUP PREFIXO
  setupPrefix(gameId, protonPath, winePrefixPath, sendInstallLog)
  //    → Cria ~/games/ProtonForger/<game>/ com drive_c/
  //    → Se já existe, no-op

  // 2. SNAPSHOT ANTES
  const before = takeSnapshot(driveCPath)
  //    → Lista recursivamente todos os .exe, .dll, .cfg

  // 3. EXECUTA INSTALADOR
  runInstaller(filePath, winePrefixPath, protonPath, gameId)
  //    → Umu.launchInstaller()
  //    → umu-run <executável>
  //    → AGUARDA o processo fechar

  // 4. SNAPSHOT DEPOIS
  const after = takeSnapshot(driveCPath)

  // 5. COMPARA
  const newExes = findNewExecutables(before, after)
  //    → Descobre .exe que foram criados dentro do prefixo

  if (newExes.length > 0) {
    return formatCandidates(newExes, driveCPath)
  }

  // 6. SE NÃO ACHOU: COPIA PASTA DO JOGO
  const sourcePath = getSourceFolder(gameKey)
  copyFolderToPrefix(sourcePath, winePrefixPath)

  // 7. ESCANEIA DE NOVO
  return scanPrefixForExes(winePrefixPath)
}
```

### 5.3 Caso 1: .exe Único (ex: Genshin Impact)

```
Jogo: Genshin Impact (custom_genshin_impact)
Arquivo baixado: ~/Downloads/GenshinImpact.exe (~150MB)

1. openGameInstaller("custom", "custom_genshin_impact", protonPath, "Genshin Impact")
2. Wine.getEffectivePrefixPath(null, "custom_genshin_impact", "Genshin Impact")
   → ~/games/ProtonForger/genshinImpact/
3. setupPrefix → cria prefixo em ~/games/ProtonForger/genshinImpact/
4. findGameFolder("Genshin Impact") → ~/Downloads/GenshinImpact.exe
5. É .exe → installAndScan("~/Downloads/GenshinImpact.exe", {...})
6. takeSnapshot() antes
7. runInstaller() → umu-run GenshinImpact.exe
   │
   ├── O instalador da miHoYo abre (interface gráfica)
   ├── Usuário faz login, escolhe idioma, inicia download dos assets
   │   (pode levar horas — o jogo completo tem ~100GB)
   ├── Quando termina, o launcher permanece aberto
   └── Usuário fecha o launcher → Promise.resolve()
   │
8. takeSnapshot() depois
9. findNewExecutables()
   → Detecta: drive_c/.../Genshin Impact/GenshinImpact.exe
   → Detecta: drive_c/.../Genshin Impact/launcher.exe
10. Retorna candidatos
11. Usuário confirma o .exe do jogo
```

### 5.4 Caso 2: Pasta com Setup (ex: jogo pirata/torrent)

```
Jogo: !!Slutia Dungeon Crawler RPG [v0.0.6]
Pasta baixada: ~/Downloads/slutia-rpg-0.0.6-windows/
Conteúdo: setup.exe, data.bin, archive.part1.rar, archive.part2.rar, ...

1. openGameInstaller("custom", "custom_lewdninja_289251", protonPath, titulo)
2. setupPrefix → cria prefixo
3. findGameFolder(titulo)
   → Tenta casar "!!Slutia Dungeon Crawler RPG [v0.0.6]"
     com "slutia-rpg-0.0.6-windows"
   → "slutia" está contido em ambos → MATCH!
   → Retorna ~/Downloads/slutia-rpg-0.0.6-windows/
4. É pasta → procura KNOWN_INSTALLER_EXES:
   setup.exe? SIM → installAndScan("setup.exe", {...})
5. takeSnapshot() antes
6. runInstaller() → umu-run setup.exe
   │ O instalador abre, usuário clica "Next > Next > Install"
   │ O jogo é extraído para drive_c/Program Files/Slutia/
   │ Usuário fecha o instalador
7. takeSnapshot() depois
8. findNewExecutables()
   → Detecta: drive_c/Program Files/Slutia/slutia.exe
9. Retorna candidato
```

### 5.5 Caso 3: Nenhuma Pasta Encontrada

```
1. openGameInstaller(...)
2. setupPrefix → prefixo CRIADO em ~/games/ProtonForger/<game>/
3. findGameFolder() → null (pasta não está em Downloads)
4. Retorna { wasOpened: true, candidates: [], suggestedDir: ~/games/... }
5. Renderer: candidates vazio → handleOpenExePicker()
6. Usuário navega até a pasta do jogo e escolhe o .exe
7. setGameExecutablePath() salva o path
8. Na próxima execução, o jogo roda dentro do prefixo já criado
```

---

## 6. Gerenciamento de Proton Tools

### 6.1 Página Proton Tools

A interface de Proton Tools tem duas implementações:

1. **`src/renderer/src/pages/home/proton-tools.tsx`** (versão antiga, 431 linhas)
   - Componente monolítico com `TOOL_ENDPOINTS` hardcoded
   - Busca releases diretamente do GitHub via API
   - Três abas: "Tools", "Downloads", "Installed"

2. **`src/renderer/src/pages/home/proton-tools/index.tsx`** (versão modular, 330 linhas)
   - Usa `PROTON_TOOLS` do arquivo `tools/index.ts`
   - Usa hook `useReleases()` para carregar releases
   - Componentes: `VersionList`, `DownloadProgress`, `ProtonInfoModal`
   - Escuta eventos `proton-download-progress` e `proton-download-complete`

### 6.2 Como as Releases São Carregadas

```typescript
// proton/index.ts:54
async function getReleases(toolId: string): Promise<ProtonRelease[]> {
  // 1. Tenta cache local primeiro
  const localReleases = getLocalReleases(toolId)
  if (localReleases.length > 0) return localReleases

  // 2. Se não tem cache, busca na API
  const tool = tools.getToolById(toolId)
  const response = await fetch(tool.endpoint)
  const json = await response.json()

  // 3. Se for github-action, processa workflow_runs
  if (tool.type === "github-action") {
    return workflowRuns.filter(run => run.conclusion === "success")
  }

  // 4. Retorna no máximo 30 releases
  return Array.isArray(json) ? json.slice(0, 30) : []
}
```

### 6.3 Cache Local de Releases

As releases obtidas via API são cacheadas em `app/_data/releases/<toolId>.json`:

```typescript
function getLocalReleases(toolId: string): ProtonRelease[] {
  const releaseDataPath = path.join(app.getAppPath(), "data", "releases", `${toolId}.json`)
  if (!fs.existsSync(releaseDataPath)) return []
  const data = JSON.parse(fs.readFileSync(releaseDataPath, "utf-8"))
  return Array.isArray(data) ? data.slice(0, 30) : []
}
```

Isso permite que o ProtonForge funcione offline para listar versões já conhecidas.

### 6.4 Como o Download de Proton Funciona (downloadTool)

O pipeline completo em `src/main/services/proton/index.ts:126`:

```
downloadTool({ toolId, release, onProgress })
│
├── 1. Verifica se já está instalado
│    const expectedPath = formatDirName(tool, release.tag_name)
│    if fs.existsSync(expectedPath + "/proton") → return expectedPath
│
├── 2. Download
│    downloader.downloadFile(tool, release, categoryDir, onProgress)
│    ├── getDownloadUrl(tool, release)
│    │   ├── Se preferTarball → tarball_url
│    │   ├── Se não → asset[assetPosition].browser_download_url
│    │   └── Fallback → tarball_url / zipball_url
│    ├── Determina extensão (.tar.xz, .tar.gz, .zip)
│    ├── Define fileName: <directoryNameFormat>.<ext>
│    └── Salva em categoryDir/<fileName>
│
├── 3. Extração
│    extractor.extractArchive(filePath, categoryDir, dirName)
│    ├── Se .zip → unzip
│    ├── Se .tar.xz → tar -xJf
│    └── Se .tar.gz → tar -xzf
│
├── 4. Encontra binário proton
│    ├── extractResult.extractPath + "/proton" → ENCONTRADO? → return
│    ├── findProtonDir(categoryDir) → busca recursiva → ENCONTRADO? → return
│    └── Nada → return null
│
└── return path REAL do Proton instalado
```

### 6.5 Diretórios de Instalação

Os Protons são instalados em:

| Categoria | Diretório |
|-----------|-----------|
| Proton | `userData/compat-tools/compatibilitytools.d/` |
| Wine | `userData/compat-tools/runners/wine/` |
| DXVK | `userData/compat-tools/runtime/dxvk/` |
| VKD3D | `userData/compat-tools/runtime/vkd3d/` |

Onde `userData` é `~/.config/protonforge/`.

### 6.6 Como os Protons Instalados São Detectados

`installer.ts:56` — `getInstalledTools()`:

1. Para cada tool em `PROTON_TOOLS`:
2. Lê o diretório da categoria (ex: `compatibilitytools.d/`)
3. Para cada subdiretório:
   - Ignora pastas internas (lib, dist, files, bin, etc.)
   - Chama `findToolByFolder(entryName)` para casar com tool conhecida
   - Se casou → adiciona à lista com `{ tool, version, path }`
4. Retorna lista deduplicada (por path real)

---

## 7. Criação de Prefixo Wine

### 7.1 Arquivo: `src/main/install-flow/prefix-setup.ts`

```typescript
async function setupPrefix(
  gameId: string,
  protonPath: string,
  winePrefixPath: string,
  onLog?: (msg: string) => void
): Promise<boolean> {

  // ─── Se já existe, não faz nada ───
  if (prefixIsValid(winePrefixPath)) {
    // Verifica: drive_c/, dosdevices/, system.reg, user.reg, userdef.reg
    return true
  }

  // ─── Cria a pasta do prefixo ───
  fs.mkdirSync(winePrefixPath, { recursive: true })

  // ─── Localiza o umu-run ───
  const umuBinary = getUmuBinaryPath()
  // app/_resources/binaries/umu-run

  // ─── Environment variables ───
  const env = {
    ...process.env,
    GAMEID: `umu-${gameId}`,
    WINEPREFIX: winePrefixPath,
    PROTONPATH: protonPath,
  }

  // ─── Executa wineboot para inicializar ───
  const child = spawn(umuBinary, ["wineboot", "-u"], { env, stdio: "ignore" })

  // ─── Aguarda até 120s ───
  child.on("exit", (code) => {
    const actual = resolveActualPrefix(winePrefixPath)
    ensurePrefixMarkers(actual)
    const valid = prefixIsValid(actual)
    resolve(valid)
  })
}
```

### 7.2 O Que o wineboot Cria

Quando `umu-run wineboot -u` é executado, ele cria:

```
~/games/ProtonForger/<game_name>/
├── drive_c/              ← "C:\" do Windows
│   ├── windows/
│   │   ├── system32/
│   │   ├── system/
│   │   └── ...
│   ├── Program Files/
│   ├── users/
│   │   └── <user>/
│   └── ...
├── dosdevices/           ← Mapeamentos de dispositivos
│   ├── c: -> drive_c/
│   └── ...
├── system.reg            ← Registry do sistema
├── user.reg              ← Registry do usuário
└── userdef.reg           ← Registry default do usuário
```

### 7.3 Onde o Prefixo é Criado

Definido em `src/main/services/wine.ts:8`:

```typescript
static getProtonForgerPrefixPath(gameTitle: string): string {
  const homeDir = os.homedir()
  return path.join(homeDir, "games", "ProtonForger", formatGameDirName(gameTitle))
}
```

Exemplo: `~/games/ProtonForger/genshinImpact/`

### 7.4 Função formatGameDirName

```typescript
// helpers/format-game-dir-name.ts
// Converte "Genshin Impact" → "genshinImpact"
// Converte "!!Slutia Dungeon Crawler RPG [v0.0.6]" → "slutiaDungeonCrawlerRpg[v0.0.6]"
```

---

## 8. Instalação de DLLs com Winetricks

### 8.1 Fluxo Atual (Implementado)

As DLLs são instaladas automaticamente durante o `installAndScan()` no `orchestrator.ts`:

```
installAndScan()
  ├── setupPrefix()              ← cria prefixo via umu-run wineboot -u
  ├── installGameDlls() via RPC  ← NOVO: instala DLLs via Python API
  │     └── consulta game_dlls.db pelo game_id
  │           ├── Se achar: instala DLLs específicas do jogo
  │           └── Se NÃO achar: instala defaults (d3dcompiler_47, vcrun2022)
  ├── takeSnapshot() + runInstaller()
  └── findNewExecutables()
```

A chamada RPC `install_game_dlls` no Python (`handler.py:91`) executa:

1. Abre `app/_data/game_dlls.db` (SQLite)
2. Busca o `game_id` na tabela `game_dlls`
3. Se encontrou → instala os winetricks da coluna `winetricks`
4. Se não → instala defaults: `d3dcompiler_47`, `vcrun2022`
5. Retorna `{ installed: [...], errors: [...] }`

### 8.2 Banco de Dados: `app/_data/game_dlls.db`

**Schema:**

```sql
CREATE TABLE game_dlls (
    game_id    TEXT PRIMARY KEY,  -- "custom_genshin_impact", "1245620", etc
    title      TEXT DEFAULT '',
    dlls       TEXT NOT NULL,     -- JSON array: ["vcrun2022", "d3dcompiler_47"]
    winetricks TEXT NOT NULL,     -- JSON array: ["vcrun2022", "d3dcompiler_47"]
    overrides  TEXT DEFAULT '',   -- WINEDLLOVERRIDES
    env_vars   TEXT DEFAULT ''    -- JSON array: ["PROTON_ENABLE_WAYLAND=0"]
);

CREATE TABLE dll_catalog (
    id         TEXT PRIMARY KEY,  -- "mfplat", "vcrun2022", etc
    dll        TEXT NOT NULL,
    impacto    TEXT NOT NULL,
    winetricks TEXT NOT NULL,
    override   TEXT DEFAULT '',
    descricao  TEXT DEFAULT '',
    jogos_tipo TEXT DEFAULT ''
);
```

**Dados seed atuais (13 jogos mapeados):**

| game_id | DLLs | Winetricks | Override |
|---------|------|------------|----------|
| `custom_genshin_impact` | vcrun2022, d3dcompiler_47, mfplat | vcrun2022, d3dcompiler_47, mf | `mfplat=n,b;d3dcompiler_47=n,b` |
| `custom_honkai_star_rail` | idem | idem | idem |
| `custom_zenless_zone_zero` | idem | idem | idem |
| `4162040` (ZZZ Steam) | idem | idem | idem |
| `3513350` (Wuthering Waves) | idem | idem | `d3dcompiler_47=n,b` |
| `3040220` (Neverness) | idem | idem | idem |
| `2064650` (Tower of Fantasy) | idem | idem | idem |
| `1671200` (Honkai Impact 3rd) | idem | idem | idem |
| Qualquer outro | vcrun2022, d3dcompiler_47 | vcrun2022, d3dcompiler_47 | `d3dcompiler_47=n,b` |

### 8.3 Como Adicionar DLLs pra um Novo Jogo

Use o script `protonforge-api/scripts/seed_game_dlls.py` como base ou insira direto no SQLite:

```bash
sqlite3 app/_data/game_dlls.db
INSERT INTO game_dlls (game_id, title, dlls, winetricks, overrides, env_vars)
VALUES (
    '1245620',
    'ELDEN RING',
    '["vcrun2022", "d3dcompiler_47"]',
    '["vcrun2022", "d3dcompiler_47"]',
    'd3dcompiler_47=n,b',
    '[]'
);
```

Ou edite o dicionário `GACHA_MAP` em `protonforge-api/scripts/seed_game_dlls.py` e reexecute.

### 8.4 DLLs Suportadas

Fonte: `tools/plaina_proton/api proton/prefixo_dlls.json` + tabela `dll_catalog`

```json
{
  "diagnostico": {
    "problema_comum": {
      "sintoma": "Tela branca/preta no login (CEF)",
      "solucao": "WINEDLLOVERRIDES=\"d3dcompiler_47=n,b\" + winetricks d3dcompiler_47",
      "alternativa": "PROTON_ENABLE_WAYLAND=0 (força X11)"
    }
  }
}
```

---

## 9. Execução de Jogos com umu-run

### 9.1 O Que é umu-run

`umu-run` é um binário (em `app/_resources/binaries/umu-run`) que gerencia a execução de aplicativos Windows no Linux usando Proton/Wine. Ele configura automaticamente:

- **WINEPREFIX**: diretório do prefixo Wine
- **PROTONPATH**: caminho do Proton a ser usado
- **GAMEID**: identificador único para o jogo (usado pelo UMU)
- Variáveis de ambiente específicas

### 9.2 LaunchInstaller vs LaunchExecutable

O arquivo `src/main/services/umu.ts` define dois métodos:

```typescript
// PARA INSTALAÇÃO: bloqueante, aguarda o fim
Umu.launchInstaller(executablePath, launchParameters, options)
  → Aguarda o processo filho terminar
  → Retorna { exitCode, signal, exitTimestamp }
  → Usado em runInstaller() (runner.ts:11)

// PARA EXECUÇÃO: não bloqueante, libera após 3s
Umu.launchExecutable(executablePath, launchParameters, options)
  → Se o processo sobreviver > 3s, considera sucesso
  → Libera a Promise e "desanexa" o processo filho
  → Usado quando o usuário clica "Jogar"
```

### 9.3 Variáveis de Ambiente na Execução

Quando um jogo é executado, estas env vars são configuradas:

```typescript
const launchEnv = {
  PROTON_LOG: "1",
  GAMEID: `umu-${gameId}`,          // Ex: umu-custom_genshin_impact
  WINEPREFIX: winePrefixPath,        // Ex: ~/games/ProtonForger/genshinImpact/
  PROTONPATH: protonPath,            // Ex: ~/.config/protonforge/.../GE-Proton10-34
  MANGOHUD: "1",                     // Se ativado
  ...launchOptions,                   // Opções do usuário
  ...customEnv,                       // Env vars customizadas
}
```

### 9.4 Comando Final Montado

O comando final executado é algo como:

```bash
PROTON_LOG=1 GAMEID=umu-custom_genshin_impact \
WINEPREFIX=~/games/ProtonForger/genshinImpact/ \
PROTONPATH=~/.config/protonforge/.../GE-Proton10-34 \
umu-run 'GenshinImpact.exe'
```

### 9.5 O Que Acontece Quando umu-run Executa

1. umu-run identifica o Proton em `PROTONPATH`
2. Configura o Wine com `WINEPREFIX`
3. Aplica as env vars de compatibilidade
4. Executa o `.exe` dentro do ambiente Proton
5. Redireciona a saída para `logs/umu.log`

---

## 10. API Python (protonforge-api)

### 10.1 Comunicação JSON-RPC

A API se comunica com o Electron via **stdin/stdout** usando JSON-RPC simples (Line Delimited JSON):

```
Request:  {"id":1,"method":"recommend_proton","params":{"game_id":"1245620"}}
Response: {"id":1,"result":{...}}
Error:    {"id":1,"error":{"code":"...","message":"..."}}
Event:    {"event":"ready","protocolVersion":1}
```

### 10.2 Métodos RPC Disponíveis

```python
# handler.py — dispatch()
METHODS = {
  "recommend_proton":    → recommendation.core.recommend()
  "get_game_info":       → catalog.get_game_info()
  "search_games":        → catalog.search_games()
  "create_prefix":       → prefix.core.create_prefix()
  "get_recommended_dlls": → dlls.get_recommended_dlls()
  "get_launch_command":  → launch_args.core.build_launch_command()
  "get_installed_protons": → proton_versions.get_installed_protons()
  "analyze_exe":         → compatflow_bridge.analyze_exe()
  "list_available_forks": → recommendation.get_available_forks()
  "check_anticheat":     → anticheat.check_anticheat()
}
```

### 10.3 Fluxo de Dados da API

```
protonforge-api/
│
├── db/connection.py
│   ├── _get_db() → catalogo.db (jogos, ~252MB)
│   └── _get_proton_db() → proton_data.db (matches, ~280MB)
│
├── services/data.py
│   └── _load_json(filename) → cache de arquivos JSON
│       Fonte: ~/Documentos/protonforgerfull/tools/plaina_proton/api proton/
│
└── services/recommendation/core.py
    ├── recommend(game_id)
    │   ├── matching.py → proton_data.db (game_matches)
    │   ├── data.py → fork-analysis.json (tierScores)
    │   ├── anticheat.py → anticheat.json (boosts)
    │   └── gacha.py → gacha_navegador_chromium.json (boosts)
    │
    └── get_available_forks()
        └── data.py → protons.json + fork-analysis.json
```

### 10.4 Tests

```bash
cd protonforge-api
pytest tests/ -v

tests/
├── test_recommendation.py    # Testa o motor de recomendação
└── test_prefix.py            # Testa criação de prefixo
```

---

## 11. Banco de Dados

### 11.1 Armazenamento Local

Usado para dados operacionais do Electron. Fica em `userData/stores/`.

Stores principais:

### 11.2 SQLite — catalogo.db (~252MB)

Banco de metadados de jogos. Fica em `app/_data/catalogo.db`.

Tabelas principais (inferidas do código):

| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `games` | objectId, title, genres, releaseYear, minimum, recommended, developer, publisher, shortDescription, tier | Catálogo de jogos |
| `games_fts` | title MATCH | Full-text search (fallback) |

### 11.3 SQLite — proton_data.db (~280MB)

Banco de dados de compatibilidade Proton.

Tabelas principais (inferidas do código):

| Tabela | Colunas | Descrição |
|--------|---------|-----------|
| `game_matches` | game_id, fork_id, version, confidence | Qual fork funciona em qual jogo |
| `fork_recommendations` | game_id, fork_id, tier_score, notes | Recomendações calculadas |

### 11.4 JSON — Dados da API Python

Fonte: `~/Documentos/protonforgerfull/tools/plaina_proton/api proton/`

| Arquivo | Tamanho | Conteúdo |
|---------|---------|----------|
| `matched.json` | ~1.7M entradas | Game matches (jogo → fork + versão) |
| `protons.json` | ~10 entradas | Definições de forks de Proton |
| `anticheat.json` | variável | Jogos com EAC/BattlEye |
| `gacha_navegador_chromium.json` | variável | Jogos gacha |
| `prefixo_dlls.json` | variável | DLLs e comandos winetricks |
| `launch_args.json` | 68 args | Launch arguments categorizados |
| `recommendations/*.json` | 10 arquivos | Recomendações por fork |

---

## 12. Eventos IPC — Mapeamento Completo

### 12.1 Eventos de Proton (src/main/events/proton/index.ts)

| Evento | Handler | Parâmetros | Retorno |
|--------|---------|------------|---------|
| `getProtonTools` | `ProtonManager.getTools()` | — | `ProtonTool[]` |
| `getProtonToolsByCategory` | `ProtonManager.getToolsByCategory(category)` | `category: string` | `ProtonTool[]` |
| `getProtonReleases` | `ProtonManager.getReleases(toolId)` | `toolId: string` | `ProtonRelease[]` |
| `downloadProtonTool` | `ProtonManager.downloadTool(toolId, release)` | `toolId, release` | `string \| null` (path) |
| `getInstalledProtonTools` | `ProtonManager.getInstalledTools()` | — | `InstalledTool[]` |
| `getProtonInstallDir` | `ProtonManager.getInstallDir()` | — | `string` |
| `removeProtonTool` | `ProtonManager.removeToolByPath(toolId, version)` | `toolId, version` | `boolean` |
| `fetchProtonReadme` | `fetchReadme({ repoUrl })` | `repoUrl: string` | `string` |
| `downloadProton` | `downloadProton(fork)` | `fork: ProtonFork` | `string \| null` |
| `recommendProton` | `ProtonRecommendationService.recommend(gameId)` | `gameId: string` | `ProtonRecommendation` |
| `analyzeGameExe` | `ProtonRecommendationService.analyzeExe(exePath)` | `exePath: string` | `any` |

### 12.2 Eventos de Biblioteca (src/main/events/library/)

| Evento | Arquivo | Descrição |
|--------|---------|-----------|
| `openGameInstaller` | `open-game-installer.ts` | Orquestra instalação completa |
| `setGameExecutablePath` | `set-game-executable-path.ts` | Salva .exe escolhido manualmente |
| `getInstalledProtonVersions` | `get-installed-proton-versions.ts` | Lista Protons do sistema |
| `launchGame` | `launch-game.ts` | Executa o jogo |
| `closeGame` | `close-game.ts` | Fecha o jogo |
| `createGameShortcut` | `create-game-shortcut.ts` | Cria atalho na área de trabalho |
| `createSteamShortcut` | `create-steam-shortcut.ts` | Cria atalho no Steam |
| `openWinetricks` | `open-game-winetricks.ts` | Abre winetricks para o jogo |
| `openWinePrefix` | `open-game-wine-prefix.ts` | Abre pasta do prefixo |

### 12.3 Eventos de Download (src/main/events/downloads/)

| Evento | Descrição |
|--------|-----------|
| `startDownload` | Inicia download |
| `pauseDownload` | Pausa download |
| `cancelDownload` | Cancela download |
| `getDownloadInfo` | Retorna info do download |
| `extractGame` | Extrai arquivos baixados |

### 12.4 Eventos de Interface

| Evento | Descrição |
|--------|-----------|
| `on-install-progress` | Enviado do main → renderer: progresso da instalação |
| `on-install-log` | Enviado do main → renderer: linha de log |
| `on-proton-download-progress` | Enviado do main → renderer: progresso do download de Proton |

---

## 13. Camada Preload

### 13.1 Arquivo: `src/preload/app.ts`

A preload expõe a API `window.electron.*` para o renderer via `contextBridge`:

```typescript
contextBridge.exposeInMainWorld("electron", {
  // Proton
  getProtonTools: () => ipcRenderer.invoke("getProtonTools"),
  getProtonToolsByCategory: (category) => ipcRenderer.invoke("getProtonToolsByCategory", category),
  getProtonReleases: (toolId) => ipcRenderer.invoke("getProtonReleases", toolId),
  downloadProtonTool: (toolId, release) => ipcRenderer.invoke("downloadProtonTool", toolId, release),
  downloadProton: (fork) => ipcRenderer.invoke("downloadProton", fork),
  analyzeGameExe: (exePath) => ipcRenderer.invoke("analyzeGameExe", exePath),
  getInstalledProtonTools: () => ipcRenderer.invoke("getInstalledProtonTools"),
  getProtonInstallDir: () => ipcRenderer.invoke("getProtonInstallDir"),
  removeProtonTool: (toolId, version) => ipcRenderer.invoke("removeProtonTool", toolId, version),

  // Instalação
  openGameInstaller: (shop, objectId, protonPath, gameTitle) =>
    ipcRenderer.invoke("openGameInstaller", shop, objectId, protonPath, gameTitle),
  setGameExecutablePath: (shop, objectId, path) =>
    ipcRenderer.invoke("setGameExecutablePath", shop, objectId, path),
  getInstalledProtonVersions: () => ipcRenderer.invoke("getInstalledProtonVersions"),
  openExeFilePicker: (defaultPath) => ipcRenderer.invoke("openExeFilePicker", defaultPath),

  // Library
  getLibrary: () => ipcRenderer.invoke("getLibrary"),
  addGameToLibrary: (shop, objectId, title) => ipcRenderer.invoke("addGameToLibrary", shop, objectId, title),
  removeGameFromLibrary: (shop, objectId) => ipcRenderer.invoke("removeGameFromLibrary", shop, objectId),

  // Event listeners (main → renderer)
  onInstallProgress: (callback) => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on("on-install-progress", listener)
    return () => ipcRenderer.removeListener("on-install-progress", listener)
  },
  onInstallLog: (callback) => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on("on-install-log", listener)
    return () => ipcRenderer.removeListener("on-install-log", listener)
  },
})
```

### 13.2 Tipos da API (declaration.d.ts)

```typescript
// src/renderer/src/declaration.d.ts
interface ElectronAPI {
  getProtonTools: () => Promise<ProtonTool[]>
  getProtonReleases: (toolId: string) => Promise<ProtonRelease[]>
  downloadProton: (fork: ProtonFork) => Promise<string | null>
  openGameInstaller: (shop: GameShop, objectId: string, protonPath?: string | null, gameTitle?: string | null) => Promise<InstallResult>
  getInstalledProtonVersions: () => Promise<ProtonVersion[]>
  // ...
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
```

---

## 14. Camada Renderer (React)

### 14.1 Hook use-install-flow.ts

O hook `useInstallFlow()` em `src/renderer/src/hooks/use-install-flow.ts` gerencia todo o estado do fluxo de instalação no frontend:

```typescript
function useInstallFlow() {
  // Estados dos modais
  const [showRecommendationModal, setShowRecommendationModal] = useState(false)
  const [showCandidateModal, setShowCandidateModal] = useState(false)
  const [showScanningModal, setShowScanningModal] = useState(false)
  const [showCopyingModal, setShowCopyingModal] = useState(false)
  const [showInstallSuccessModal, setShowInstallSuccessModal] = useState(false)

  // Estados de dados
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null)
  const [installedProtons, setInstalledProtons] = useState<ProtonVersion[]>([])
  const [candidates, setCandidates] = useState<CandidateExe[]>([])

  // Refs para dados pendentes
  const pendingInstallRef = useRef<[GameShop, string] | null>(null)
  const pendingGameRef = useRef<[GameShop, string] | null>(null)

  // Handlers
  const handleOpenGameInstaller = useCallback(async (shop, objectId) => { ... })
  const handleDownloadAndSelect = useCallback(async (fork) => { ... })
  const handleSelectProton = useCallback(async (protonPath) => { ... })
  const handleExePicked = useCallback(async (path) => { ... })
  const handleOpenExePicker = useCallback(async (dirOverride?) => { ... })
}
```

### 14.2 Fluxo no Renderer

```
1. handleOpenGameInstaller()
   ├── Busca Protons instalados
   ├── Salva pendingInstallRef + pendingGameRef
   └── setShowRecommendationModal(true)

2. Modal de recomendação aparece
   ├── Mostra lista de Protons com scores
   ├── Usuário escolhe um
   └── Chama handleDownloadAndSelect(fork) ou handleSelectProton(path)

3a. handleDownloadAndSelect(fork)
   ├── downloadProton(fork)
   ├── Se sucesso → openGameInstaller(path)
   └── Se erro → setInstallProgress({ status: "error" })

3b. handleSelectProton(path)
   ├── setInstallProgress({ status: "prefix", percent: 80 })
   └── openGameInstaller(path)

4. openGameInstaller retorna InstallResult
   ├── candidates.length > 0
   │   └── Mostra modal com lista de .exe detectados
   └── candidates.length === 0
       └── handleOpenExePicker() → usuário escolhe .exe manualmente
```

---

## 15. Variáveis de Ambiente e Launch Options

### 15.1 Catálogo de Launch Args

Fonte: `tools/plaina_proton/api proton/launch_args.json` (68 args categorizados)

Os 12 args mais comuns:

| Variável | Descrição | Forks Suportados |
|----------|-----------|------------------|
| `DXVK_ASYNC=1` | Compilação assíncrona de shaders (reduz stutter) | GE, CachyOS, DW |
| `DXVK_FRAME_RATE=<N>` | Limita FPS via DXVK | Todos |
| `VKD3D_CONFIG=dxr` | Ray Tracing via VKD3D | Valve, GE, CachyOS, EM |
| `PROTON_ENABLE_NVAPI=1` | Habilita DLSS e Reflex (NVIDIA) | Valve, GE, CachyOS, DW |
| `PROTON_ENABLE_WAYLAND=1` | Força Wayland (em vez de XWayland) | GE, CachyOS, EM |
| `PROTON_USE_WINED3D=1` | Usa WineD3D (OpenGL) em vez de DXVK | Todos |
| `PROTON_NO_FSYNC=1` | Desabilita fsync | Todos |
| `PROTON_HEAP_DELAY_FREE=1` | Contorna use-after-free em alguns jogos | Valve, GE, CachyOS |
| `PULSE_LATENCY_MSEC=60` | Ajusta buffer do PulseAudio (elimina estalos) | Todos |
| `WINEDLLOVERRIDES="..."` | Sobrescreve carregamento de DLLs | Todos |
| `MANGOHUD=1` | Overlay de desempenho (FPS, temperaturas) | Valve, GE, CachyOS |
| `GAMEMODERUN` | Otimiza CPU governor, IO priority | Valve, GE, CachyOS |

### 15.2 Como as Launch Options São Aplicadas

No Electron (`umu.ts:249`):

```typescript
const launchEnv = {
  PROTON_LOG: "1",
  GAMEID: `umu-${gameId}`,
  WINEPREFIX: winePrefixPath,
  PROTONPATH: protonPath,
  ...launchOptions,       // Do usuário (Settings → Launch Options)
  ...customEnv,           // Da recomendação da API
}
```

Na API Python (`launch_args/core.py:38`):

```python
def build_launch_command(game_id, prefix_path, proton_path, executable, launch_options, env_overrides):
    env_vars = {
        "WINEPREFIX": prefix_path,
        "PROTONPATH": proton_path,
        "STEAM_COMPAT_DATA_PATH": prefix_path,
    }
    if launch_options:
        parsed = _parse_launch_options_string(launch_options)
        env_vars.update(parsed)
    if env_overrides:
        env_vars.update(env_overrides)
    return {
        "env_vars": env_vars,
        "command": f"{proton_path}/proton",
        "args": ["run", executable],
        "shell_command": "WINEPREFIX=... PROTONPATH=... /proton run executable"
    }
```

---

## 16. Análise de Executáveis com CompatFlow

### 16.1 O Que é CompatFlow

CompatFlow é um sistema de análise de executáveis Windows que determina:

- Se o `.exe` é um **instalador**, **jogo**, **aplicativo nativo Linux** ou **port**
- Se existe versão nativa Linux disponível
- Qual o nome do jogo associado

### 16.2 Arquitetura

```
data/compatflow/
├── core/
│   ├── analyzer.py       ← Analisa o .exe (PE header, imports, etc.)
│   └── database.py       ← Banco de apps nativos (300+), ports (280+)
├── cli.py                ← CLI para análise standalone
└── utils/system.py       ← Utilitários de sistema
```

### 16.3 Como a Análise Funciona

```python
def analyze_exe(exe_path):
    result = compatflow_analyze(exe_path)

    if result["type"] == "game":
        # É um jogo → precisa de recomendação de Proton
        return { "needs_recommendation": True, "can_install": True }

    elif result["type"] == "native":
        # É um app nativo → não precisa de Proton
        return { "needs_recommendation": False, "has_native": True }

    elif result["type"] == "port":
        # É um port Linux (Lutris, etc.)
        return { "needs_recommendation": False, "has_port": True }
```

O resultado alimenta o fluxo de recomendação de Proton.

---

## 17. Tratamento de Erros e Logs

### 17.1 Sistema de Logs

O ProtonForge usa `electron-log` (configurado em `src/main/services/logger.ts`):

```typescript
log.transports.file.resolvePathFn = (_, message) => {
  if (message?.scope === "python-rpc") return path.join(logsPath, "pythonrpc.txt")
  if (message?.scope === "network") return path.join(logsPath, "network.txt")
  if (message?.scope == "achievements") return path.join(logsPath, "achievements.txt")
  if (message?.level === "error") return path.join(logsPath, "error.txt")
  if (message?.level === "info") return path.join(logsPath, "info.txt")
  return path.join(logsPath, "logs.txt")
}
```

### 17.2 Localização dos Logs

```
~/.config/protonforge/logs/
├── logs.txt           ← Log geral (debug)
├── info.txt           ← Apenas info
├── error.txt          ← Apenas erros
├── pythonrpc.txt      ← Comunicação Python RPC
├── network.txt        ← Requisições de rede
├── achievements.txt   ← Sistema de conquistas
└── umu.log            ← Saída do umu-run
```

### 17.3 Como os Erros São Propagados

```
ERRO NO MAIN PROCESS
│
├── Se dentro de IPC handler (try/catch):
│   ├── logger.error() → logs/error.txt + console
│   └── sendInstallProgress("error", 0) → renderer
│
├── Se no download:
│   ├── downloadTool retorna null
│   ├── downloadProton retorna null
│   └── Renderer: setInstallProgress({ status: "error" })
│
└── Se na extração:
    ├── extractor retorna { success: false, error: "..." }
    ├── downloadTool trata e loga
    └── downloadProton retorna null
│
ERRO NO RENDERER
│
├── Try/catch no handleDownloadAndSelect:
│   └── setInstallProgress({ status: "error", percent: 0 })
│
└── Erro não capturado:
    └── Console do Electron (F12)
```

### 17.4 Mensagens de Log por Fluxo

| Contexto | Prefixo | Onde |
|----------|---------|------|
| Download de Proton | `[downloadProton]` | `install-game-with-proton.ts` |
| Match fork → toolId | `[findToolId]` | `tools.ts:findToolIdByForkName` |
| Pipeline download | `[downloadTool]` | `proton/index.ts:downloadTool` |
| Extração | `[extrator]` | `proton/extractor.ts` |
| Criação de prefixo | `[setupPrefix]` | `prefix-setup.ts` |
| Orquestração | `[orchestrator]` | `orchestrator.ts` |
| Execução do jogo | `[runInstaller]` | `runner.ts` |

---

## 18. Histórico de Bugs Corrigidos

### Bug 1 — logger não importado em tools.ts

**Arquivo:** `src/main/services/proton/tools.ts` — linha 1

**Sintoma:** `ReferenceError: logger is not defined` ao chamar `findToolIdByForkName()`.

**Causa:** A função usava `logger.info()` e `logger.error()` (linhas 221-239) mas o arquivo só importava `import type { ProtonTool } from "./types"`. Nenhum import do `logger` existia.

**Impacto:** Toda chamada a `downloadProton()` crashava imediatamente na linha 50 (`findToolIdByForkName(fork)`). QUALQUER tentativa de instalar um jogo resultava em erro.

**Fluxo do erro:**
```
handleDownloadAndSelect(fork)
  → downloadProton(fork)           [install-game-with-proton.ts:45]
    → findToolIdByForkName(fork)   [tools.ts:217] ← logger.info() CRASHA
    → catch(error)                 [install-game-with-proton.ts:123]
      → logger.error("exception")  ← funciona, logger existe aqui
      → sendInstallProgress("error", 0)
      → return null
  → protonPath é null
  → throw new Error("Falha ao baixar Proton")
  → setInstallProgress({ status: "error" })
```

**Fix:** `import { logger } from "@main/services/logger"` adicionado no topo.

---

### Bug 2 — downloadProton ignorava path real do downloadTool

**Arquivo:** `src/main/events/proton/install-game-with-proton.ts` — linhas 77-121

**Sintoma:** Após baixar e extrair o Proton com sucesso (log mostrava `proton encontrado em ...`), o código não conseguia encontrar o diretório e retornava erro.

**Causa:** A função `ProtonManager.downloadTool()` já retorna o caminho **REAL** do Proton extraído (ex: `.../ValveSoftware-Proton-25880e8`). Mas o código tratava o retorno como booleano:
```typescript
// ANTES (ERRADO):
const downloadSuccess = await ProtonManager.downloadTool(...)
// downloadSuccess era string|null, mas tratado como boolean
if (!downloadSuccess) { ... }  // funciona, mas descarta o path
// Depois RECALCULAVA o path:
const dirName = formatDirName(tool, release.tag_name)  // "proton-11.0-1-beta5"
const resolvedPath = path.join(categoryDir, dirName)   // ← NÃO EXISTE!
// O diretório real é "ValveSoftware-Proton-25880e8", não "proton-11.0-1-beta5"
```

**Fix:** Renomeado `downloadSuccess` → `toolPath`. Agora usa o path REAL retornado por `downloadTool()` diretamente. Removeu todo o bloco de recálculo e fallback que era redundante.

```typescript
// DEPOIS (CORRETO):
const toolPath = await ProtonManager.downloadTool(...)
if (!toolPath) { ... }  // null = falha
return toolPath          // string = caminho real
```

---

### Bug 3 — statSync crashava em diretório inexistente

**Arquivo:** `src/main/services/proton/index.ts` — linha 219

**Sintoma:** `Error: ENOENT: no such file or directory, stat '.../proton-11.0-1-beta5'`

**Causa:** Quando o tarball do GitHub extraía para um diretório com hash (`ValveSoftware-Proton-<commit_hash>`), o `findNewDirectory()` do extrator detectava o diretório novo na primeira vez. Mas na segunda execução (ou quando o diretório já existia de um download anterior), `findNewDirectory()` retornava `null` porque não havia nada "novo" — o diretório já estava na lista `before`. O código então usava `expectedFolderName` (`proton-11.0-1-beta5`) como fallback, mas esse diretório NUNCA foi criado pelo tar. O `fs.statSync(actualPath)` crashava porque o path não existia.

**Cadeia do erro:**
```
1. downloadTool()
2. extractArchive() → findNewDirectory() retorna null
   (diretório já existe de download anterior)
3. extractPath = path.join(destinationDir, expectedFolderName)
   = ".../proton-11.0-1-beta5" ← NÃO EXISTE
4. fs.existsSync(actualPath + "/proton") → false
5. fs.statSync(actualPath) → ENOENT CRASH
```

**Fix:** Substituiu a lógica que tentava acessar `actualPath` diretamente. Agora usa `findProtonDir(categoryDir)` que busca recursivamente TODOS os subdiretórios pelo binário `proton`, independente do nome da pasta:

```typescript
// DEPOIS (CORRETO):
const foundInCategory = findProtonDir(categoryDir)
// Busca recursivamente por qualquer arquivo "proton"
// em qualquer subdiretório de categoryDir
if (foundInCategory) {
  // Tenta renomear para o nome esperado (se não existir conflito)
  renameDirToExpected(foundInCategory, expectedPath)
  return foundInCategory
}
```

---

### Bug 4 — setupPrefix nunca chamado quando pasta do jogo não encontrada

**Arquivo:** `src/main/events/library/open-game-installer.ts` — linhas 57-60

**Sintoma:** O prefixo Wine NUNCA era criado quando a pasta/jogo não estava em `~/Downloads/`.

**Causa:** `openGameInstaller()` primeiro procurava os arquivos do jogo em `~/Downloads/` via `findGameFolder()`. Se não encontrasse, retornava imediatamente com `{ wasOpened: true, candidates: [], suggestedDir }`. O `setupPrefix()` estava DENTRO de `installAndScan()`, que só era chamado SE os arquivos fossem encontrados.

Problemas de matching que causavam o early return:
- Nome da pasta `slutia-rpg-0.0.6-windows` **não contém** o título `!!Slutia Dungeon Crawler RPG [v0.0.6]`
- `"slutia"` está contido em ambos, então esse caso específico funciona
- Mas se o jogo for baixado com nome diferente do título, não há match

Mesmo quando o jogo NÃO está em Downloads, o prefixo DEVERIA ser criado para que o usuário possa depois escolher o .exe manualmente e jogar dentro do prefixo já configurado.

**Fix:** `setupPrefix()` agora é chamado LOGO NO INÍCIO de `openGameInstaller()`, antes de qualquer busca por arquivos:

```typescript
// DEPOIS (CORRETO) — linhas 48-50:
if (objectId && effectiveProtonPath && effectiveWinePrefixPath) {
  await setupPrefix(objectId, effectiveProtonPath, effectiveWinePrefixPath)
}
```

Como `setupPrefix()` tem guard `prefixIsValid()` na linha 42, chamadas múltiplas são seguras (no-op na segunda vez).

---

### Bug 5 — Path do umu-run errado em prefix-setup.ts

**Arquivo:** `src/main/install-flow/prefix-setup.ts` — linha 10

**Sintoma:** `[setupPrefix] umu-run not found at /home/cas/Documentos/app/_resources/binaries/umu-run`

A pasta correta seria `/home/cas/Documentos/protonforgerfull/app/_resources/binaries/umu-run`.

**Causa:** Havia DUAS funções `getUmuBinaryPath()` no código, com caminhos relativos diferentes:

| Arquivo | Caminho | Níveis | Correto? |
|---------|---------|--------|----------|
| `src/main/services/umu.ts:27` | `"..", "..", "resources", ...` | 2 | ✅ |
| `src/main/install-flow/prefix-setup.ts:10` | `"..", "..", "..", "resources", ...` | 3 | ❌ |

O compilador (SWC via electron-vite) compila todo o código para `out/main/`. O `__dirname` em runtime é `out/main/`. Com 2 níveis (`../../`): resolve para a raiz do projeto. Com 3 níveis (`../../../`): resolve para a PASTA ACIMA do projeto.

**Fix:** Alterado de `"..", "..", ".."` para `"..", ".."` em `prefix-setup.ts`.

```typescript
// ANTES (ERRADO):
path.join(__dirname, "..", "..", "..", "resources", "binaries", "umu-run")
// Resolve: /home/cas/Documentos/app/_resources/binaries/umu-run ← ERRADO

// DEPOIS (CORRETO):
path.join(__dirname, "..", "..", "resources", "binaries", "umu-run")
// Resolve: /home/cas/Documentos/protonforgerfull/app/_resources/binaries/umu-run ← CORRETO
```

---

## 19. Como Compilar e Executar

### 19.1 Compilar

```bash
cd /home/cas/Documentos/protonforgerfull
yarn build
```

Compila `src/` → `out/`. Gera:
- `out/main/index.js` — Processo principal
- `out/main/index-*.js` — Chunks do main
- `out/preload/index.mjs` — Preload
- `out/renderer/index.html` + assets — Frontend React

### 19.2 Executar

```bash
# Opção 1: via start.sh
./start.sh
# Depois escolhe a opção desejada:
#   1 - Iniciar (sem compilar)
#   2 - Verificar + compilar + iniciar
#   3 - Setup completo (reinstalar + restaurar interface)
#   4 - Verificar consistência (bild.cjs check)
#   5 - Apenas compilar (bild.cjs build)

# Opção 2: direto com Electron
yarn start       # electron-vite preview
yarn dev         # electron-vite dev (com hot reload)
```

### 19.3 Dependências

```bash
# Node.js 20+ e Yarn 1.x
node --version   # v26.1.0
yarn --version   # 1.22.22

# Python 3.10+ (para API)
python3 --version

# Instalar deps Node
yarn install

# Instalar deps Python
cd protonforge-api
pip install -r requirements.txt

# umu-run já inclus em app/_resources/binaries/
```

### 19.4 Debug

```bash
# Ver logs em tempo real
tail -f ~/.config/protonforge/logs/logs.txt
tail -f ~/.config/protonforge/logs/error.txt

# Abrir DevTools no Electron (F12 ou Ctrl+Shift+I)

# Verificar build atual
yarn build
```

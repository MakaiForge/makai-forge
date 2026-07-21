# Análise Arquitetural — Makai Forge (Estado Atual)

> Gerado em: 20/07/2026
> Projeto: `/home/cas/Documentos/Makai_forge/`

---

## 1. ÁRVORE DO PROJETO (visão genética)

```
Makai_forge/
│
├── [ELETRON SHELL]  src/
│   ├── main/           ← Processo principal Electron (TypeScript)
│   │   ├── index.ts / main.ts / bootstrap.ts  ← Entry points
│   │   ├── events/     ← 130+ IPC handlers (bridge UI ↔ backend)
│   │   │   ├── auth/ games/ library/ catalogue/ home/
│   │   │   ├── hardware/ torrenting/ scripts/ runners/
│   │   │   ├── proton/ steam/ profile/ user/ admin/
│   │   │   ├── backup/ cloud-save/ notifications/
│   │   │   ├── themes/ achievements/ supplemental/
│   │   │   └── helpers/
│   │   ├── services/   ← Serviços core (TS)
│   │   │   ├── forger-api.ts / makai-api.ts / protonforge-api.ts
│   │   │   ├── qbittorrent.ts / steam.ts / ludusavi.ts
│   │   │   ├── python-rpc.ts ← Ponte para Python
│   │   │   ├── compatibility-tools.ts
│   │   │   ├── delete-game.ts / game-log-manager.ts
│   │   │   ├── hosters/ backup/ chrome-browser/ ws/
│   │   │   └── ...
│   │   ├── store/      ← Persistência (SQLite)
│   │   └── helpers/    ← Utilitários
│   │
│   ├── renderer/src/   ← React UI
│   │   ├── pages/      ← 18 páginas (rotas)
│   │   │   ├── home/           ← Aba Início
│   │   │   ├── catalogue/      ← Catálogo de jogos
│   │   │   ├── games/          ← Biblioteca de jogos
│   │   │   ├── game-details/   ← Detalhes do jogo
│   │   │   ├── game-launcher/  ← Overlay de lançamento
│   │   │   ├── game-log/       ← Log do jogo
│   │   │   ├── downloads/      ← Gerenciador de downloads
│   │   │   ├── settings/       ← Configurações
│   │   │   ├── profile/        ← Perfil de usuário
│   │   │   ├── notifications/  ← Central de notificações
│   │   │   ├── emulators/      ← Biblioteca de emuladores
│   │   │   ├── emulator-detail/ ← Detalhes do emulador
│   │   │   ├── theme-editor/   ← Editor de temas
│   │   │   ├── scripts/        ← Editor de scripts
│   │   │   └── shared-modals/  ← Modais compartilhados
│   │   ├── services/           ← Serviços do lado renderer
│   │   ├── theme/              ← Sistema de temas
│   │   └── scss/               ← Design tokens
│   │
│   ├── shared/          ← Código compartilhado main + renderer
│   ├── types/           ← Definições TypeScript globais
│   │   ├── game.types.ts
│   │   ├── download.types.ts
│   │   ├── mods.types.ts       ← Tipos do Mod Manager
│   │   └── ...
│   └── locales/         ← 50+ idiomas (i18n)
│
├── [APP PACKAGE]  app/
│   │
│   ├── _main/                      ← Processo principal do Electron
│   │   ├── bootstrap/              ← Setup window, autoupdater, resource manager
│   │   ├── container/              ← Engine de container (bwrap, runtime, makai_time)
│   │   ├── emulators/              ← Engine de emuladores
│   │   ├── installer-api/          ← API de instalação (extractors, classifier)
│   │   ├── rpc/                    ← Python RPC server
│   │   └── torrent-rpc/            ← Cliente RPC para torrents
│   │
│   ├── _resources/                 ← Runtime binaries
│   │   ├── chrome/                 ← Chromium (~381 MB)
│   │   ├── binaries/               ← 7zzs, qBittorrent, umu-run, torrent-tracker
│   │   ├── extensions/             ← UltraSurf VPN, UltraWelcome
│   │   ├── native/                 ← ProtonForge native Rust addon
│   │   └── python/                 ← wine_log.py, wine_log_gui.py
│   │
│   ├── _assets/                    ← UI assets
│   │   ├── backgrounds/            ← setup.png, setup-alt.png
│   │   ├── audio/                  ← achievement.wav
│   │   └── assets/icons/
│   │       ├── app/                ← icon.png, tray-icon.png, ...
│   │       └── emulators/          ← 34 SVGs de emuladores
│   │
│   ├── _data/                      ← Bancos + manifests
│   │   ├── proton_data.db          ← (281 MB)
│   │   ├── fork_catalog.db         ← (4.9 MB)
│   │   ├── supplemental.db         ← (50 MB)
│   │   ├── resonance.json
│   │   ├── catalogs/               ← Catálogos de jogos
│   │   ├── games-data/             ← Dados extraídos
│   │   └── releases/               ← Releases de Proton
│   │
│   ├── _shared/                    ← Componentes, hooks, context compartilhados
│   ├── _styles/                    ← SCSS themes
│   ├── _venv/                      ← Python virtualenv
│   ├── app.scss / app.tsx          ← Entry points React
│   ├── Catalogo/                   ← Páginas de catálogo (React)
│   ├── Games/                      ← Páginas e serviços de jogos
│   ├── Home/ Library/ ...          ← Outras páginas React
│   └── ProtonTools/                ← Catálogo de Protons
│
├── scripts/                        ← Scripts de build
├── dist/ out/ cache/               ← Saída de build / cache
│
└── config/ electron-builder.yml    ← Configuração
```

---

## 2. STACK TECNOLÓGICA

| Camada | Tecnologia | Localização |
|--------|-----------|-------------|
| Shell Desktop | Electron 39 | `src/main/` |
| UI | React 18 + TypeScript + SCSS | `src/renderer/src/` + `tools/*/ui/` |
| State | Redux Toolkit + Zustand | `src/renderer/src/store.ts` |
| Bundler | Vite 6 + electron-vite + SWC | `electron.vite.config.ts` |
| Rota | React Router DOM v6 (HashRouter) | `src/renderer/src/main.tsx` |
| IPC | `ipcMain.handle` / `contextBridge` | `src/main/events/` (~130 handlers) |
| Backend Python | JSON-lines RPC via stdin/stdout | `app/Catalogo/GameMod/core/server.py` |
| Container | bubblewrap (bwrap) | `app/_main/container/makai_time/engine/` |
| Proton | 30+ forks externos | `engine/intel/definitions/` |
| Persistência | SQLite (better-sqlite3) + JSON | `src/main/store/` + `app/Catalogo/GameMod/core/storage.py` |
| Torrent | qBittorrent (subprocesso) | `src/main/services/qbittorrent.ts` |
| Nativo | Rust (napi-rs) | `app/_resources/app/_resources/native/protonforge-app/_resources/native/` |
| i18n | i18next | `src/locales/` (50+ idiomas) |

---

## 3. ROTEAMENTO (React — 18 páginas)

```
/                      → Home (Início, deals, notícias)
/catalogue             → Catálogo de jogos
/downloads             → Downloads (queue)
/game/:shop/:objectId  → GameDetails (hero, config, launch)
/settings              → Configurações (geral, runners, etc)
/profile/:userId       → Perfil de usuário
/notifications         → Central de notificações
/proton-tools          → Proton Tools (navegar/instalar Protons)
/games                 → Biblioteca de jogos instalados
/emulators             → Biblioteca de emuladores
/emulator/:runnerId    → Detalhes do emulador
/mod-manager           → Mod Manager ★ (app/Catalogo/GameMod/ui/)
/game-log              → Log do jogo em tempo real
/executable-select     → Seletor de executável (janela separada)
/folder-select         → Seletor de pasta (janela separada)
/theme-editor          → Editor de temas customizados
/game-launcher         → Overlay de lançamento
```

---

## 4. ARQUITETURA DE COMUNICAÇÃO

```
React UI (renderer)
    │
    ▼  window.electron.*  (contextBridge)
    │
Electron Main (src/main/)
    │
    ├── IPC Events (130+ handlers)  →  resposta direta
    │
    └── Python RPC Client (services/python-rpc.ts)
            │  stdin/stdout JSON-lines
            ▼
        app/Catalogo/GameMod/core/server.py
            │
            ├── play.py          →  launch.py  →  makrun (subprocess)
            ├── makaitricks.py   →  winetricks
            ├── storage.py       →  ~/.config/makai-forger/mods-store.json
            ├── games_registry.py
            ├── deploy.py
            └── ...
```

---

## 5. SEPARAÇÃO GAME vs MOD MANAGER

### 🎮 GAME (Launcher de jogos)

| Funcionalidade | Onde está | Tecnologia |
|---------------|-----------|------------|
| Biblioteca de jogos (CRUD) | `src/main/events/library/` | TypeScript |
| Catálogo + preços | `src/main/events/catalogue/` | TypeScript |
| Detalhes do jogo | `src/renderer/src/pages/game-details/` | React |
| Downloads (torrent + HTTP) | `src/main/events/torrenting/`, `app/_main/installer-api/` | TypeScript |
| Pipeline de lançamento | `app/Catalogo/GameMod/core/play.py` | **Python** |
| Descoberta de Proton | `app/Catalogo/GameMod/core/engine/proton.py` | Python |
| Detecção de jogos | `app/Catalogo/GameMod/core/detection.py` | Python |
| Container bwrap | `app/_main/container/makai_time/engine/container/` | Python |
| Makai Time Engine | `app/_main/container/makai_time/engine/` (tudo) | Python |
| Proton Intelligence | `app/_main/container/makai_time/engine/intel/` | Python |
| Engine de emuladores | `app/_main/emulators/` | TypeScript |
| Gestão de prefixo Wine | `app/_main/container/makai_time/engine/core/` | TypeScript |
| Game launcher pipeline (TS) | `tools/game_launcher/play/` | TypeScript |
| Game bar overlay | `tools/game_launcher/game-bar/` | React |

### 🔧 MOD MANAGER (Gerenciador de mods)

| Funcionalidade | Onde está | Tecnologia |
|---------------|-----------|------------|
| UI principal | `app/Catalogo/GameMod/ui/ModManager.tsx` | React |
| Lista de mods (drag-drop) | `app/Catalogo/GameMod/ui/components/ModListPanel/` | React |
| Instalação de mods (zip) | `app/_main/rpc/install/` | TypeScript |
| Instalador FOMOD | `app/_main/rpc/fomod/` | TypeScript |
| Deploy de mods | `app/_main/rpc/mod-deploy/` | TypeScript |
| Detecção de conflitos | `app/_main/rpc/mod-conflict-service.ts` | TypeScript |
| Ordem de plugins (LOOT) | `app/_main/rpc/plugin-sort-service.ts` | TypeScript |
| Editor de INI | `app/Catalogo/GameMod/ui/components/RightPanel/` | React |
| Script Extenders (SKSE) | `app/_main/rpc/skse-downloader.ts` | TypeScript |
| Framework installer | `app/_main/rpc/framework-installer.ts` | TypeScript |
| ESLifier | `app/Catalogo/GameMod/events/mod-eslifier.ts` | TypeScript |
| Lógica por jogo (mods) | `app/Catalogo/GameMod/games/` (40+ pastas) | TypeScript |

### 🧩 COMPARTILHADO (difuso)

| Funcionalidade | Localização | Problema |
|---------------|-------------|----------|
| Makaitricks (winetricks) | `app/Catalogo/GameMod/core/engine/makaitricks.py` | É chamado pelo play.py (Game) mas está dentro do Mods_manager |
| Launch pipeline Python | `app/Catalogo/GameMod/core/play.py` → `engine/launch.py` | Pipeline de GAME dentro da pasta MOD MANAGER |
| Game config panel | `app/Catalogo/GameMod/ui/components/GameConfigPanel/` | Config de GAME dentro da UI do MOD MANAGER |
| Proton switching | `app/Catalogo/GameMod/events/mod-switch-proton.ts` | Evento de Proton dentro do MOD MANAGER |
| Proton Tools | `app/Catalogo/GameMod/proton-tools/` | Ferramenta de Proton dentro do MOD MANAGER |
| Games por jogo (Python) | `app/Catalogo/GameMod/core/Games/` | Lógica de GAME em Python dentro do MOD MANAGER |
| server.py | `app/Catalogo/GameMod/core/server.py` | ÚNICO RPC server serve TUDO (game + mod + prefixo) |

---

## 6. PROBLEMAS ARQUITETURAIS IDENTIFICADOS

### 🔴 Críticos

| # | Problema | Impacto |
|---|----------|---------|
| 1 | **`app/Catalogo/GameMod/` é uma "casa da mãe Joana"** — mistura Python (core/), TypeScript (events/, services/, games/), React (ui/), e Proton Tools (proton-tools/) | Sem fronteiras claras entre Game e ModManager. Dependências emaranhadas. |
| 2 | **server.py (RPC único) dentro de Mods_manager** — serve requisições de GAME, MOD, PREFIXO, tudo pelo mesmo pipe | Se o Mod Manager quebrar, o jogo não lança. Acoplamento mortal. |
| 3 | **Dois pipelines de lançamento** — `app/Catalogo/GameMod/core/play.py` (Python) e `tools/game_launcher/play/` (TypeScript) | Duplicação de lógica, risco de inconsistência. |
| 4 | **Dois sistemas de persistência** — SQLite (`src/main/store/`) + JSON (`app/Catalogo/GameMod/core/storage.py`) | Estado fragmentado, sem fonte única da verdade. |
| 5 | **Hardcoded sys.path hacks** — `server.py` linhas 29-39 usam `sys.path.insert(0, ...)` para 6 diretórios diferentes | Qualquer mudança de diretório quebra o backend. |

### 🟡 Médios

| # | Problema | Impacto |
|---|----------|---------|
| 6 | **game_launcher/ fora de Mods_manager** mas `play.py` (Game) dentro de Mods_manager | Nomenclatura confusa: "Mods_manager" contém o Game runner |
| 7 | **Proton Intelligence duplicada conceitualmente** — `engine/intel/definitions/` (30 forks) vs `app/Catalogo/GameMod/core/games_registry.py` (DLL overrides por engine) | Sem mapeamento claro entre fork definitions e game profiles |
| 8 | **18 aliases Vite** — `@mods`, `@prefix`, `@game-launcher`, `@proton`, `@emulators` etc. | Ambiente de build frágil, qualquer alias quebrado derruba o app |
| 9 | **50+ arquivos de tradução** para app em desenvolvimento ativo | Overhead enorme de manutenção |
| 10 | **Chrome embedded (centenas de MB)** — `app/_resources/chrome/chrome-linux64/` | Bloat no pacote final |

### 🟢 Leves

| # | Problema |
|---|----------|
| 11 | Mistura de português e inglês em comentários e docs |
| 12 | yarn e npm convivendo (package.json tem `"npm": "please-use-yarn"`) |
| 13 | VENV Python criada em runtime pelo Electron (\`app/_main/bootstrap/venv.ts\`) |
| 14 | Ludusavi binary em `app/_app/_resources/binaries/ludusavi/` + referenciado em `electron-builder.yml` |
| 15 | `cache/` na raiz com JSON hash-keyed sem padrão claro |

---

## 7. DEPENDÊNCIAS ENTRE PASTAS (estado atual)

```
src/main/events/
    ├── games/          →  app/Catalogo/GameMod/core/server.py (RPC)
    ├── library/        →  app/Catalogo/GameMod/core/server.py
    ├── torrenting/     →  (autônomo, qBittorrent)
    ├── runners/        →  app/Catalogo/GameMod/core/server.py
    ├── proton/         →  app/_main/container/ + app/Catalogo/GameMod/
    ├── steam/          →  (autônomo, VDF parsing)
    └── ... 

src/main/services/
    ├── python-rpc.ts   →  app/Catalogo/GameMod/core/server.py
    ├── qbittorrent.ts  →  (autônomo)
    ├── compatibility-tools.ts  →  ~/.config/makai-forger/compat-tools/
    └── ...

app/Catalogo/GameMod/core/
    ├── server.py       →  play.py → engine/launch.py → makrun (subprocess)
    │                   →  engine/makaitricks.py (winetricks)
    │                   →  storage.py (JSON)
    │                   →  games_registry.py
    │                   →  deploy.py
    │                   →  app/_main/container/makai_time/engine/python/ (sys.path insert)
    │                   →  app/_main/installer-api/proton_recommended/python/ (sys.path insert)
    └── Games/          →  (autônomo, lógica por jogo)

app/_main/container/makai_time/engine/
    ├── core/runner.py  →  container/builder.py → steps/
    ├── intel/          →  (autônomo, definitions + profiles)
    ├── resolver/       →  (autônomo, path resolution)
    └── util/           →  (autônomo, utils)

tools/game_launcher/
    ├── play/           →  (pipeline TS, duplicado do play.py Python)
    └── launch/         →  (orquestração)

app/_main/emulators/        →  (autônomo)
```

---

## 8. ROTAS DO REACT + ORIGEM DOS COMPONENTES

| Rota | Componente | Origem do código |
|------|-----------|-----------------|
| `/` | Home | `src/renderer/src/pages/home/` |
| `/catalogue` | Catalogue | `src/renderer/src/pages/catalogue/` |
| `/downloads` | Downloads | `src/renderer/src/pages/downloads/` |
| `/game/:shop/:objectId` | GameDetails | `src/renderer/src/pages/game-details/` |
| `/settings` | Settings | `src/renderer/src/pages/settings/` |
| `/profile/:userId` | Profile | `src/renderer/src/pages/profile/` |
| `/notifications` | Notifications | `src/renderer/src/pages/notifications/` |
| `/proton-tools` | ProtonToolsPage | `app/Catalogo/GameMod/proton-tools/renderer/pages/proton-tools/` |
| `/games` | Games | `app/_main/installer-api/Games` (!! via alias @provision) |
| `/emulators` | Emulators | `src/renderer/src/pages/emulators/` |
| `/emulator/:runnerId` | EmulatorDetail | `src/renderer/src/pages/emulator-detail/` |
| `/mod-manager` | **ModManager** | `app/Catalogo/GameMod/ui/ModManager.tsx` |
| `/game-log` | GameLog | `src/renderer/src/pages/game-log/` |
| `/executable-select` | ExecutableSelect | `src/renderer/src/pages/executable-select/` |
| `/folder-select` | FolderSelect | `src/renderer/src/pages/folder-select/` |
| `/theme-editor` | ThemeEditor | `src/renderer/src/pages/theme-editor/` |
| `/game-launcher` | GameLauncher | `src/renderer/src/pages/game-launcher/` |

---

## 9. RESUMO: O QUE PRECISA SER SEPARADO

### Proposta de organização futura

```
Makai_forge/
│
├── src/                    ← Electron App (SHELL)
│   ├── main/               ← Main process
│   ├── renderer/           ← UI React (APENAS app shell + páginas comuns)
│   ├── shared/             ← Shared TS
│   └── types/              ← Global types
│
├── packages/               ← Módulos independentes
│   ├── game-launcher/      ← TUDO relacionado a jogo (antes espalhado)
│   │   ├── core/           ← Python: play.py, launch.py, proton.py, makaitricks.py
│   │   ├── events/         ← TypeScript: IPC handlers de jogo
│   │   ├── services/       ← TypeScript: serviços de jogo
│   │   ├── ui/             ← React: páginas de jogo (game-details, game-launcher)
│   │   └── package.json    ← Escopo próprio
│   │
│   ├── mod-manager/        ← TUDO de mod (separado do jogo)
│   │   ├── core/           ← Python: deploy, fomod, framework install
│   │   ├── events/         ← TypeScript: IPC handlers de mod
│   │   ├── services/       ← TypeScript: serviços de mod
│   │   ├── ui/             ← React: ModManager, ModList, etc.
│   │   └── package.json
│   │
│   └── app/Catalogo/GameMod/  ← Mod Manager (migrado de tools/Mods_manager/)
│       ├── core/              ← Python: server, play, detection, deploy
│       ├── events/            ← TypeScript: IPC handlers
│       ├── services/          ← TypeScript: serviços
│       ├── games/             ← TypeScript: 40+ jogos
│       └── ui/                ← React: ModManager, ModList, etc.
│
├── app/_main/container/      ← Makai Time Engine (migrado de tools/prefix/)
│   └── makai_time/engine/    ← Runner Python + bwrap container
│
├── app/_main/emulators/      ← Engine de emuladores (migrado de tools/emulators/)
│   └── definitions/          ← 30+ emuladores
│
├── app/ProtonTools/          ← Catálogo de Protons
│
├── app/_resources/           ← Runtime binaries
├── app/_assets/              ← UI assets
├── app/_data/                ← Bancos + manifests
├── app/_shared/ _styles/ _venv/
│
└── electron.vite.config.ts ← Aliases simplificados (ou packages com escopo)
```

---

## 10. PRÓXIMOS PASSOS SUGERIDOS

1. **Extrair `game-launcher`** de dentro de `app/Catalogo/GameMod/` — `play.py`, `engine/launch.py`, `engine/proton.py`, `engine/makaitricks.py` pertencem ao Game, não ao Mod Manager
2. **Criar RPC separado** para Mod Manager — `server.py` não pode ser o único ponto de entrada
3. **Unificar storage** — SQLite como fonte única, JSON eliminado
4. **Mover `app/Catalogo/GameMod/core/Games/`** (Python) para `game-launcher/`
5. **Mover `app/Catalogo/GameMod/ui/`** (React) para `mod-manager/ui/`
6. **Separar `app/Catalogo/GameMod/games/`** (TypeScript, 40+ jogos) — são regras de mod por jogo, pertencem ao Mod Manager
7. **Eliminar `app/Catalogo/GameMod/`** — extrair tudo para pacotes com dono claro
8. **Remover `tools/game_launcher/play/`** (duplicata TypeScript) — manter apenas o pipeline Python

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
├── [BACKEND TOOLS]  tools/
│   │
│   ├── Mods_manager/               ← ★ O GRANDE PROBLEMA (mistura tudo)
│   │   ├── core/                   ← Python: coração do backend
│   │   │   ├── server.py           ← RPC server (único ponto de entrada Python)
│   │   │   ├── play.py             ← Pipeline de lançamento de jogos
│   │   │   ├── storage.py          ← Armazenamento JSON
│   │   │   ├── games_registry.py   ← DB de jogos por engine
│   │   │   ├── detection.py        ← Detecção de instalação
│   │   │   ├── deploy.py           ← Deploy de mods
│   │   │   ├── engine/             ← Motores de jogo
│   │   │   │   ├── launch.py       ← Subprocess makrun
│   │   │   │   ├── proton.py       ← Descoberta de Proton
│   │   │   │   ├── makaitricks.py  ← Winetricks
│   │   │   │   ├── framework_installer.py
│   │   │   │   ├── registry.py
│   │   │   │   └── external_tool_installer.py
│   │   │   ├── Games/              ← Lógica específica por jogo (Python)
│   │   │   │   ├── Bethesda/
│   │   │   │   ├── Skyrim Special Edition/
│   │   │   │   ├── Cyberpunk 2077/
│   │   │   │   └── ... (15+ jogos)
│   │   │   └── Utils/              ← Utilitários Python
│   │   │
│   │   ├── events/                 ← TypeScript: IPC handlers do Mod Manager
│   │   │   ├── mod-deploy.ts
│   │   │   ├── mod-launch.ts
│   │   │   ├── mod-config.ts
│   │   │   ├── mod-fomod.ts
│   │   │   ├── mod-conflicts.ts
│   │   │   ├── mod-load-order.ts
│   │   │   ├── mod-storage.ts
│   │   │   ├── mod-ini.ts
│   │   │   ├── mod-backup.ts
│   │   │   ├── mod-eslifier.ts
│   │   │   ├── mod-bridge.ts       ← Ponte legada
│   │   │   ├── mod-prefix-rpc.ts
│   │   │   ├── mod-switch-proton.ts
│   │   │   └── framework-install.ts
│   │   │
│   │   ├── games/                  ← TypeScript: lógica por jogo (40+ jogos)
│   │   │   ├── registry.ts
│   │   │   ├── _shared/            ← Lógica compartilhada (Bethesda, BepInEx)
│   │   │   ├── skyrim/ skyrim-se/ skyrim-vr/
│   │   │   ├── fallout4/ cyberpunk2077/ starfield/
│   │   │   ├── witcher3/ larian/ minecraft/
│   │   │   └── ... (40+ jogos)
│   │   │
│   │   ├── services/               ← TypeScript: serviços do Mod Manager
│   │   │   ├── mod-manager-service.ts
│   │   │   ├── mod-storage-service.ts
│   │   │   ├── mod-deploy/         ← Motor de deploy
│   │   │   ├── mod-conflict-service.ts
│   │   │   ├── install/            ← Pipeline de instalação
│   │   │   ├── fomod/              ← Parse de FOMOD
│   │   │   ├── detection/
│   │   │   ├── framework-installer.ts
│   │   │   ├── launch-service.ts
│   │   │   ├── skse-downloader.ts
│   │   │   ├── plugin-sort-service.ts
│   │   │   ├── prefix-validator.ts
│   │   │   └── ...
│   │   │
│   │   ├── ui/                     ← React: Interface do Mod Manager
│   │   │   ├── ModManager.tsx      ← Página principal
│   │   │   ├── components/         ← Componentes UI
│   │   │   │   ├── ModListPanel/
│   │   │   │   ├── RightPanel/
│   │   │   │   ├── FomodDialog/
│   │   │   │   ├── GameConfigPanel/
│   │   │   │   ├── ProtonConfigPanel/
│   │   │   │   └── Modals/
│   │   │   ├── hooks/
│   │   │   └── types/
│   │   │
│   │   ├── presets/                ← Presets de jogos
│   │   ├── proton-tools/           ← Página de Proton Tools
│   │   │   ├── main/
│   │   │   └── renderer/pages/proton-tools/
│   │   │
│   │   └── data/ docs/
│   │
│   ├── prefix/                     ← MAKAI TIME ENGINE (container/bwrap)
│   │   ├── makai_time/
│   │   │   └── makrun/             ← Runner Python (pacote pip)
│   │   │       ├── __main__.py / cli.py
│   │   │       ├── core/           ← Core do runner
│   │   │       │   ├── runner.py / command.py
│   │   │       │   ├── environment.py / prefix.py
│   │   │       │   ├── translator.py / seccomp.py
│   │   │       ├── container/      ← Motor de container (bwrap)
│   │   │       │   ├── builder.py / capsule.py / manifest.py
│   │   │       │   └── steps/      ← 14 passos de construção
│   │   │       ├── intel/          ← Proton Intelligence
│   │   │       │   ├── definitions/ ← 30+ forks de Proton
│   │   │       │   ├── anticheat/  ← 31 jogos
│   │   │       │   ├── profiles.py / injector.py
│   │   │       │   └── analyzer.py / recommender.py
│   │   │       ├── resolver/       ← Resolução de caminhos
│   │   │       └── util/           ← Utilitários
│   │   │
│   │   ├── core/                   ← TypeScript: gestão de prefixo
│   │   ├── events/                 ← TypeScript: IPC de prefixo
│   │   ├── python/                 ← Python: utilitários de prefixo
│   │   ├── wine_prefix/            ← React: modal de configuração
│   │   └── umu-run                 ← Binário UMU
│   │
│   ├── game_launcher/              ← TypeScript: pipeline de lançamento
│   │   ├── launch/launch-game.ts
│   │   ├── play/                   ← 7-step pipeline
│   │   ├── install/
│   │   ├── game-bar/               ← Overlay in-game (React)
│   │   └── rpc.py
│   │
│   ├── emulators/                  ← TypeScript: engine de emuladores
│   │   └── definitions/            ← 30+ emuladores
│   │
│   └── ludusavi/                   ← Binário de backup de saves
│
├── resources/                      ← Recursos estáticos
│   ├── icons/ audio/ binaries/
│   ├── bootstrap/ chrome/ database/
│   ├── emulators/icons/
│   ├── extensions/ installer-api/
│   └── python/
│
├── data/                           ← Dados em runtime
│   ├── install-api/                ← Pipeline de instalação
│   │   ├── ForgePipeline/
│   │   ├── CompactFlow/
│   │   ├── Games/                  ← Configs de instalação por jogo
│   │   ├── proton_recommended/     ← Motor de recomendação (Python)
│   │   ├── scripts/
│   │   └── knowledge/
│   ├── assets/ catalogs/ cache/
│   └── games-data/ logs/
│
├── native/                         ← Addon nativo (Rust)
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
| Backend Python | JSON-lines RPC via stdin/stdout | `tools/Mods_manager/core/server.py` |
| Container | bubblewrap (bwrap) | `tools/prefix/makai_time/makrun/` |
| Proton | 30+ forks externos | `makrun/intel/definitions/` |
| Persistência | SQLite (better-sqlite3) + JSON | `src/main/store/` + `tools/Mods_manager/core/storage.py` |
| Torrent | qBittorrent (subprocesso) | `src/main/services/qbittorrent.ts` |
| Nativo | Rust (napi-rs) | `native/protonforge-native/` |
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
/mod-manager           → Mod Manager ★ (tools/Mods_manager/ui/)
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
        tools/Mods_manager/core/server.py
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
| Downloads (torrent + HTTP) | `src/main/events/torrenting/`, `data/install-api/` | TypeScript |
| Pipeline de lançamento | `tools/Mods_manager/core/play.py` | **Python** |
| Descoberta de Proton | `tools/Mods_manager/core/engine/proton.py` | Python |
| Detecção de jogos | `tools/Mods_manager/core/detection.py` | Python |
| Container bwrap | `tools/prefix/makai_time/makrun/container/` | Python |
| Makai Time Engine | `tools/prefix/makai_time/makrun/` (tudo) | Python |
| Proton Intelligence | `tools/prefix/makai_time/makrun/intel/` | Python |
| Engine de emuladores | `tools/emulators/` | TypeScript |
| Gestão de prefixo Wine | `tools/prefix/core/` | TypeScript |
| Game launcher pipeline (TS) | `tools/game_launcher/play/` | TypeScript |
| Game bar overlay | `tools/game_launcher/game-bar/` | React |

### 🔧 MOD MANAGER (Gerenciador de mods)

| Funcionalidade | Onde está | Tecnologia |
|---------------|-----------|------------|
| UI principal | `tools/Mods_manager/ui/ModManager.tsx` | React |
| Lista de mods (drag-drop) | `tools/Mods_manager/ui/components/ModListPanel/` | React |
| Instalação de mods (zip) | `tools/Mods_manager/services/install/` | TypeScript |
| Instalador FOMOD | `tools/Mods_manager/services/fomod/` | TypeScript |
| Deploy de mods | `tools/Mods_manager/services/mod-deploy/` | TypeScript |
| Detecção de conflitos | `tools/Mods_manager/services/mod-conflict-service.ts` | TypeScript |
| Ordem de plugins (LOOT) | `tools/Mods_manager/services/plugin-sort-service.ts` | TypeScript |
| Editor de INI | `tools/Mods_manager/ui/components/RightPanel/` | React |
| Script Extenders (SKSE) | `tools/Mods_manager/services/skse-downloader.ts` | TypeScript |
| Framework installer | `tools/Mods_manager/services/framework-installer.ts` | TypeScript |
| ESLifier | `tools/Mods_manager/events/mod-eslifier.ts` | TypeScript |
| Lógica por jogo (mods) | `tools/Mods_manager/games/` (40+ pastas) | TypeScript |

### 🧩 COMPARTILHADO (difuso)

| Funcionalidade | Localização | Problema |
|---------------|-------------|----------|
| Makaitricks (winetricks) | `tools/Mods_manager/core/engine/makaitricks.py` | É chamado pelo play.py (Game) mas está dentro do Mods_manager |
| Launch pipeline Python | `tools/Mods_manager/core/play.py` → `engine/launch.py` | Pipeline de GAME dentro da pasta MOD MANAGER |
| Game config panel | `tools/Mods_manager/ui/components/GameConfigPanel/` | Config de GAME dentro da UI do MOD MANAGER |
| Proton switching | `tools/Mods_manager/events/mod-switch-proton.ts` | Evento de Proton dentro do MOD MANAGER |
| Proton Tools | `tools/Mods_manager/proton-tools/` | Ferramenta de Proton dentro do MOD MANAGER |
| Games por jogo (Python) | `tools/Mods_manager/core/Games/` | Lógica de GAME em Python dentro do MOD MANAGER |
| server.py | `tools/Mods_manager/core/server.py` | ÚNICO RPC server serve TUDO (game + mod + prefixo) |

---

## 6. PROBLEMAS ARQUITETURAIS IDENTIFICADOS

### 🔴 Críticos

| # | Problema | Impacto |
|---|----------|---------|
| 1 | **`tools/Mods_manager/` é uma "casa da mãe Joana"** — mistura Python (core/), TypeScript (events/, services/, games/), React (ui/), e Proton Tools (proton-tools/) | Sem fronteiras claras entre Game e ModManager. Dependências emaranhadas. |
| 2 | **server.py (RPC único) dentro de Mods_manager** — serve requisições de GAME, MOD, PREFIXO, tudo pelo mesmo pipe | Se o Mod Manager quebrar, o jogo não lança. Acoplamento mortal. |
| 3 | **Dois pipelines de lançamento** — `tools/Mods_manager/core/play.py` (Python) e `tools/game_launcher/play/` (TypeScript) | Duplicação de lógica, risco de inconsistência. |
| 4 | **Dois sistemas de persistência** — SQLite (`src/main/store/`) + JSON (`tools/Mods_manager/core/storage.py`) | Estado fragmentado, sem fonte única da verdade. |
| 5 | **Hardcoded sys.path hacks** — `server.py` linhas 29-39 usam `sys.path.insert(0, ...)` para 6 diretórios diferentes | Qualquer mudança de diretório quebra o backend. |

### 🟡 Médios

| # | Problema | Impacto |
|---|----------|---------|
| 6 | **game_launcher/ fora de Mods_manager** mas `play.py` (Game) dentro de Mods_manager | Nomenclatura confusa: "Mods_manager" contém o Game runner |
| 7 | **Proton Intelligence duplicada conceitualmente** — `makrun/intel/definitions/` (30 forks) vs `tools/Mods_manager/core/games_registry.py` (DLL overrides por engine) | Sem mapeamento claro entre fork definitions e game profiles |
| 8 | **18 aliases Vite** — `@mods`, `@prefix`, `@game-launcher`, `@proton`, `@emulators` etc. | Ambiente de build frágil, qualquer alias quebrado derruba o app |
| 9 | **50+ arquivos de tradução** para app em desenvolvimento ativo | Overhead enorme de manutenção |
| 10 | **Chrome embedded (centenas de MB)** — `resources/chrome/chrome-linux64/` | Bloat no pacote final |

### 🟢 Leves

| # | Problema |
|---|----------|
| 11 | Mistura de português e inglês em comentários e docs |
| 12 | yarn e npm convivendo (package.json tem `"npm": "please-use-yarn"`) |
| 13 | VENV Python criada em runtime pelo Electron (`resources/bootstrap/venv.ts`) |
| 14 | Ludusavi binary em `tools/ludusavi/` + referenciado em `electron-builder.yml` |
| 15 | `cache/` na raiz com JSON hash-keyed sem padrão claro |

---

## 7. DEPENDÊNCIAS ENTRE PASTAS (estado atual)

```
src/main/events/
    ├── games/          →  tools/Mods_manager/core/server.py (RPC)
    ├── library/        →  tools/Mods_manager/core/server.py
    ├── torrenting/     →  (autônomo, qBittorrent)
    ├── runners/        →  tools/Mods_manager/core/server.py
    ├── proton/         →  tools/prefix/ + tools/Mods_manager/
    ├── steam/          →  (autônomo, VDF parsing)
    └── ... 

src/main/services/
    ├── python-rpc.ts   →  tools/Mods_manager/core/server.py
    ├── qbittorrent.ts  →  (autônomo)
    ├── compatibility-tools.ts  →  ~/.config/makai-forger/compat-tools/
    └── ...

tools/Mods_manager/core/
    ├── server.py       →  play.py → engine/launch.py → makrun (subprocess)
    │                   →  engine/makaitricks.py (winetricks)
    │                   →  storage.py (JSON)
    │                   →  games_registry.py
    │                   →  deploy.py
    │                   →  tools/prefix/python/ (sys.path insert)
    │                   →  data/install-api/proton_recommended/python/ (sys.path insert)
    └── Games/          →  (autônomo, lógica por jogo)

tools/prefix/makai_time/makrun/
    ├── core/runner.py  →  container/builder.py → steps/
    ├── intel/          →  (autônomo, definitions + profiles)
    ├── resolver/       →  (autônomo, path resolution)
    └── util/           →  (autônomo, utils)

tools/game_launcher/
    ├── play/           →  (pipeline TS, duplicado do play.py Python)
    └── launch/         →  (orquestração)

tools/emulators/        →  (autônomo)
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
| `/proton-tools` | ProtonToolsPage | `tools/Mods_manager/proton-tools/renderer/pages/proton-tools/` |
| `/games` | Games | `data/install-api/Games` (!! via alias @provision) |
| `/emulators` | Emulators | `src/renderer/src/pages/emulators/` |
| `/emulator/:runnerId` | EmulatorDetail | `src/renderer/src/pages/emulator-detail/` |
| `/mod-manager` | **ModManager** | `tools/Mods_manager/ui/ModManager.tsx` |
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
│   ├── makai-engine/       ← Makai Time Engine (container + bwrap)
│   │   ├── makrun/         ← Python package
│   │   ├── events/         ← TypeScript: IPC de prefixo
│   │   └── ui/             ← React: wine_prefix modal
│   │
│   ├── emulators/          ← Engine de emuladores
│   │   ├── core/           ← TypeScript
│   │   └── definitions/    ← 30+ emulators
│   │
│   └── proton-tools/       ← Catálogo de Protons
│       └── core/ + ui/
│
├── resources/              ← Apenas recursos estáticos
├── data/                   ← Apenas dados de runtime
├── native/                 ← Addon Rust
│
├── tools/                  ← (eliminar ou virar gateway para packages/)
│
└── electron.vite.config.ts ← Aliases simplificados (ou packages com escopo)
```

---

## 10. PRÓXIMOS PASSOS SUGERIDOS

1. **Extrair `game-launcher`** de dentro de `tools/Mods_manager/` — `play.py`, `engine/launch.py`, `engine/proton.py`, `engine/makaitricks.py` pertencem ao Game, não ao Mod Manager
2. **Criar RPC separado** para Mod Manager — `server.py` não pode ser o único ponto de entrada
3. **Unificar storage** — SQLite como fonte única, JSON eliminado
4. **Mover `tools/Mods_manager/core/Games/`** (Python) para `game-launcher/`
5. **Mover `tools/Mods_manager/ui/`** (React) para `mod-manager/ui/`
6. **Separar `tools/Mods_manager/games/`** (TypeScript, 40+ jogos) — são regras de mod por jogo, pertencem ao Mod Manager
7. **Eliminar `tools/Mods_manager/`** — extrair tudo para pacotes com dono claro
8. **Remover `tools/game_launcher/play/`** (duplicata TypeScript) — manter apenas o pipeline Python

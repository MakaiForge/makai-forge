# Plano de Reorganização — Makai Forge

> **Objetivo**: Reorganizar o projeto sem quebrar nada. Cada fase é verificável — compilar + abrir o app antes de passar à próxima.

---

## Estrutura Alvo

```
Makai-forge/
│
├── UI/                                    ← INTERFACE ELECTRON (React + TypeScript + SCSS)
│   ├── index.html
│   ├── package.json                       ← dependencies da UI
│   ├── electron.vite.config.ts            ← build config (ATUALIZADO com novos paths)
│   ├── config/
│   │   ├── tsconfig.web.json
│   │   └── tsconfig.node.json
│   │
│   ├── shell/                             ← Electron shell (main + preload)
│   │   ├── main/                          ← src/main/ (entry point, bootstrap, single-instance)
│   │   └── preload/                       ← src/preload/ (IPC bridge, 200+ canais)
│   │
│   ├── shared/                            ← Código compartilhado entre main e renderer
│   │   ├── types/                         ← src/types/
│   │   ├── shared/                        ← src/shared/
│   │   └── locales/                       ← src/locales/ (i18n, 34 idiomas)
│   │
│   ├── renderer/                          ← RENDERER ROOT
│   │   ├── main.tsx                       ← entry React
│   │   ├── app.tsx                        ← shell layout (Sidebar + Header + Outlet)
│   │   ├── store.ts                       ← Redux store (11 slices)
│   │   ├── helpers.ts
│   │   ├── constants.ts
│   │   │
│   │   ├── components/                    ← Componentes compartilhados (32 dirs)
│   │   │   ├── avatar/
│   │   │   ├── backdrop/
│   │   │   ├── badge/
│   │   │   ├── bottom-panel/
│   │   │   ├── browser-view/              ← Browser embutido (16 arquivos)
│   │   │   ├── button/
│   │   │   ├── checkbox-field/
│   │   │   ├── collapsed-menu/
│   │   │   ├── confirmation-modal/
│   │   │   ├── context-menu/
│   │   │   ├── create-collection-modal/
│   │   │   ├── debrid-badge/
│   │   │   ├── dropdown-menu/
│   │   │   ├── fullscreen-media-modal/
│   │   │   ├── game-card/
│   │   │   ├── game-context-menu/
│   │   │   ├── header/
│   │   │   ├── hero/
│   │   │   ├── link/
│   │   │   ├── modal/
│   │   │   ├── progress-bar/
│   │   │   ├── proton-path-picker/
│   │   │   ├── radio-field/
│   │   │   ├── search-dropdown/
│   │   │   ├── select-field/
│   │   │   ├── sidebar/
│   │   │   ├── suspense-wrapper/
│   │   │   ├── text-field/
│   │   │   └── toast/
│   │   │
│   │   ├── features/                      ← Redux slices (11)
│   │   ├── hooks/                         ← Custom hooks (24)
│   │   ├── context/                       ← React contexts (4)
│   │   ├── theme/                         ← ThemeProvider, ThemeBackground, variables
│   │   ├── scss/                          ← Tokens SCSS globais (12 arquivos)
│   │   ├── assets/                        ← Ícones, imagens, SVGs
│   │   ├── services/                      ← store.service.ts
│   │   └── utils/                         ← badge-icons, html-sanitizer
│   │
│   ├── pages/                             ← ★ PÁGINAS POR ABA
│   │   │
│   │   ├── home/                          ← ABA: INÍCIO
│   │   │   ├── home.tsx
│   │   │   ├── home.scss
│   │   │   ├── hooks/useHomeData.ts
│   │   │   ├── utils/formatters.ts
│   │   │   └── components/
│   │   │       ├── news-carousel/
│   │   │       ├── featured-deals/
│   │   │       └── free-games/
│   │   │
│   │   ├── catalogue/                     ← ABA: CATÁLOGO
│   │   │   ├── index.tsx
│   │   │   ├── types.ts
│   │   │   ├── hooks/
│   │   │   ├── components/
│   │   │   └── css/
│   │   │
│   │   ├── downloads/                     ← ABA: DOWNLOADS
│   │   │   ├── index.tsx
│   │   │   ├── types.ts
│   │   │   ├── hooks/
│   │   │   ├── utils/
│   │   │   └── components/
│   │   │       ├── download-ativo/
│   │   │       ├── download-concluido/
│   │   │       ├── download-parado/
│   │   │       ├── shared/
│   │   │       └── *-modal.tsx
│   │   │
│   │   ├── game-details/                  ← ABA: DETALHES DO JOGO
│   │   │   ├── game-details.tsx
│   │   │   ├── hero/
│   │   │   ├── description-header/
│   │   │   ├── gallery-slider/
│   │   │   ├── scripts-section/
│   │   │   ├── sidebar/
│   │   │   ├── cloud-sync/
│   │   │   └── modals/
│   │   │
│   │   ├── games/                         ← ABA: GAMES (biblioteca local + Steam)
│   │   │   ├── index.tsx                  ← era data/install-api/Games/index.tsx
│   │   │   ├── types.ts
│   │   │   ├── hooks/
│   │   │   ├── components/
│   │   │   │   ├── cards/
│   │   │   │   ├── sections/
│   │   │   │   ├── toolbar/
│   │   │   │   ├── gamebar/
│   │   │   │   ├── modals/
│   │   │   │   └── skeleton/
│   │   │   └── utils/
│   │   │
│   │   ├── proton-tools/                  ← ABA: PROTON TOOLS
│   │   │   ├── index.tsx                  ← era tools/Mods_manager/proton-tools/renderer/
│   │   │   ├── components/
│   │   │   │   ├── version-list/
│   │   │   │   ├── download-progress/
│   │   │   │   ├── proton-info-modal/
│   │   │   │   ├── games-tab/
│   │   │   │   ├── prefix-progress-modal/
│   │   │   │   ├── proton-path-picker/
│   │   │   │   ├── protondb-badge/
│   │   │   │   └── protondb-section/
│   │   │   ├── hooks/
│   │   │   ├── services/proton-api.ts
│   │   │   └── assets/
│   │   │
│   │   ├── mod-manager/                   ← ABA: MOD MANAGER
│   │   │   ├── ModManager.tsx             ← era tools/Mods_manager/ui/
│   │   │   ├── ModManager.scss
│   │   │   ├── hooks/
│   │   │   │   ├── config/
│   │   │   │   ├── deploy/
│   │   │   │   ├── mods/
│   │   │   │   ├── ui/
│   │   │   │   └── utils/
│   │   │   ├── components/
│   │   │   │   ├── BainDialog/
│   │   │   │   ├── FomodDialog/
│   │   │   │   ├── GameConfigPanel/
│   │   │   │   ├── GameDetectionWizard/
│   │   │   │   ├── HealthBanner/
│   │   │   │   ├── InstallProgressOverlay/
│   │   │   │   ├── LaunchOverlay/
│   │   │   │   ├── ModListPanel/
│   │   │   │   ├── ModManagerTabs/
│   │   │   │   ├── ModManagerTopBar/
│   │   │   │   ├── ProtonConfigPanel/
│   │   │   │   ├── RightPanel/
│   │   │   │   └── shared/
│   │   │   ├── types/
│   │   │   ├── utils/
│   │   │   └── _layout/                   ← SCSS partials
│   │   │
│   │   ├── settings/                      ← ABA: AJUSTES
│   │   │   ├── settings.tsx
│   │   │   ├── settings.scss
│   │   │   ├── settings-context-*.tsx
│   │   │   ├── settings-*.tsx
│   │   │   ├── appearance/
│   │   │   ├── settings-general/
│   │   │   ├── settings-behavior/
│   │   │   ├── settings-account/
│   │   │   ├── settings-runners/
│   │   │   ├── settings-debrid/
│   │   │   ├── settings-login/
│   │   │   └── settings-*.scss
│   │   │
│   │   ├── profile/                       ← ABA: PERFIL
│   │   │   ├── profile.tsx
│   │   │   ├── profile-hero/
│   │   │   ├── profile-content/
│   │   │   ├── edit-profile-modal/
│   │   │   └── upload-background-image-button/
│   │   │
│   │   ├── notifications/                 ← ABA: NOTIFICAÇÕES
│   │   │   └── notifications.tsx
│   │   │
│   │   ├── emulators/                     ← ABA: EMULADORES
│   │   │   ├── emulators.tsx
│   │   │   └── emulator-detail/
│   │   │
│   │   └── shared-modals/                 ← Modais compartilhados entre abas
│   │       ├── install-script/
│   │       ├── binary-not-found/
│   │       └── cloud/
│   │
│   └── windows/                           ← Janelas standalone (sem Sidebar)
│       ├── game-launcher/
│       ├── game-log/
│       ├── executable-select/
│       ├── folder-select/
│       └── theme-editor/
│
├── backend/                               ← BACKEND (TypeScript main process + Python)
│   │
│   ├── events/                            ← IPC event handlers (TypeScript)
│   │   ├── home/
│   │   ├── catalogue/
│   │   ├── downloads/
│   │   ├── games/
│   │   ├── library/
│   │   ├── proton/
│   │   ├── steam/
│   │   ├── themes/
│   │   ├── auth/
│   │   ├── profile/
│   │   ├── notifications/
│   │   ├── runners/
│   │   ├── scripts/
│   │   ├── mod-manager/                   ← era tools/Mods_manager/events/
│   │   └── chrome-browser/
│   │
│   ├── services/                          ← Business logic (TypeScript)
│   │   ├── logger.ts
│   │   ├── steam.ts
│   │   ├── steam-scanner.ts
│   │   ├── game-deals.ts
│   │   ├── linux-news.ts
│   │   ├── game-executables.ts
│   │   ├── window-manager.ts
│   │   ├── python-rpc.ts
│   │   ├── cloud-sync.ts
│   │   ├── library-sync/
│   │   ├── mod-manager/                   ← era tools/Mods_manager/services/
│   │   ├── proton-tools/                  ← era tools/Mods_manager/proton-tools/main/
│   │   └── ...
│   │
│   ├── python/                            ← PYTHON BACKEND (RPC server)
│   │   ├── server.py                      ← RPC entry point
│   │   ├── play.py                        ← Game launch flow
│   │   ├── deploy.py                      ← Mod deployment
│   │   ├── detection.py                   ← Game detection
│   │   ├── games_registry.py
│   │   ├── storage.py
│   │   ├── engine/                        ← Launch engine
│   │   │   ├── launch.py
│   │   │   ├── proton.py
│   │   │   ├── makaitricks.py
│   │   │   └── registry.py
│   │   ├── proton-recommendation/         ← era data/install-api/proton_recommended/python/
│   │   └── Games/                         ← Configs de jogos (26 dirs)
│   │
│   └── bootstrap/                         ← First-run + auto-update
│       ├── resource-manager.ts
│       ├── setup-window.ts
│       ├── update-manager.ts
│       ├── venv.ts
│       └── autoupdater/
│
├── games/                                 ← Per-game TypeScript modules (34 jogos)
│   ├── registry.ts                        ← Master registry
│   ├── _shared/                           ← Shared utils (bethesda, bepinex, etc.)
│   ├── skyrim/
│   ├── skyrim-se/
│   ├── fallout4/
│   ├── starfield/
│   ├── witcher3/
│   ├── cyberpunk2077/
│   └── ... (34 total)
│
├── native/                                ← Rust addon (não mexer)
├── resources/                             ← Static assets (icons, DBs, binaries)
├── data/                                  ← Dados (catalogues, cache, logs)
├── config/                                ← Build configs
├── scripts/                               ← Build scripts
└── start-makaiforge.sh
```

---

## Fases de Implementação

### Fase 0: Backup e Preparação
- [ ] Criar backup completo do projeto (`cp -r Makai-forge Makai-forge.bak`)
- [ ] Verificar que `npm run build` funciona no estado atual
- [ ] Verificar que o app abre corretamente
- [ ] Documentar estado atual no `error.log`

### Fase 1: Criar estrutura de pastas vazias
- [ ] Criar `UI/` e suas subpastas (shell/, shared/, renderer/, pages/, windows/)
- [ ] Criar `backend/` e suas subpastas (events/, services/, python/, bootstrap/)
- [ ] Criar `games/`
- [ ] NÃO mover nenhum arquivo ainda — apenas criar a árvore de pastas

### Fase 2: Mover Renderer Core
- [ ] Mover `src/renderer/` → `UI/renderer/`
- [ ] Mover `src/preload/` → `UI/shell/preload/`
- [ ] Mover `src/types/` → `UI/shared/types/`
- [ ] Mover `src/shared/` → `UI/shared/shared/`
- [ ] Mover `src/locales/` → `UI/shared/locales/`
- [ ] Mover `index.html` → `UI/index.html`
- [ ] **Verificar**: `npm run build` + abrir app

### Fase 3: Mover Pages para UI/pages/
- [ ] Mover `UI/renderer/pages/home/` → `UI/pages/home/`
- [ ] Mover `UI/renderer/pages/catalogue/` → `UI/pages/catalogue/`
- [ ] Mover `UI/renderer/pages/downloads/` → `UI/pages/downloads/`
- [ ] Mover `UI/renderer/pages/game-details/` → `UI/pages/game-details/`
- [ ] Mover `UI/renderer/pages/settings/` → `UI/pages/settings/`
- [ ] Mover `UI/renderer/pages/profile/` → `UI/pages/profile/`
- [ ] Mover `UI/renderer/pages/notifications/` → `UI/pages/notifications/`
- [ ] Mover `UI/renderer/pages/emulators/` + `emulator-detail/` → `UI/pages/emulators/`
- [ ] Mover `UI/renderer/pages/shared-modals/` → `UI/pages/shared-modals/`
- [ ] Mover `UI/renderer/pages/library/` → `UI/pages/library/`
- [ ] Mover `UI/renderer/pages/scripts/` → `UI/pages/scripts/`
- [ ] Mover `UI/renderer/pages/games/` (SCSS) → integrar em `UI/pages/games/`
- [ ] **Verificar**: `npm run build` + abrir app

### Fase 4: Mover Pages Externas (consolidar)
- [ ] Mover `data/install-api/Games/` → `UI/pages/games/` (consolidar com Fase 3)
- [ ] Mover `tools/Mods_manager/proton-tools/renderer/` → `UI/pages/proton-tools/`
- [ ] Mover `tools/Mods_manager/ui/` → `UI/pages/mod-manager/`
- [ ] Mover `tools/Mods_manager/presets/` → `UI/pages/mod-manager/presets/`
- [ ] Mover `data/install-api/ForgePipeline/ui/` → `UI/pages/shared-modals/` (ou pages relevantes)
- [ ] Mover `data/install-api/proton_recommended/ui/` → `UI/pages/proton-tools/components/`
- [ ] **Verificar**: `npm run build` + abrir app

### Fase 5: Mover Windows Standalone
- [ ] Mover `UI/renderer/pages/game-launcher/` → `UI/windows/game-launcher/`
- [ ] Mover `UI/renderer/pages/game-log/` → `UI/windows/game-log/`
- [ ] Mover `UI/renderer/pages/executable-select/` → `UI/windows/executable-select/`
- [ ] Mover `UI/renderer/pages/folder-select/` → `UI/windows/folder-select/`
- [ ] Mover `UI/renderer/pages/theme-editor/` → `UI/windows/theme-editor/`
- [ ] **Verificar**: `npm run build` + abrir app

### Fase 6: Mover Main Process (backend TypeScript)
- [ ] Mover `src/main/index.ts` → `backend/` (ou manter como entry point)
- [ ] Mover `src/main/events/` → `backend/events/`
- [ ] Mover `src/main/services/` → `backend/services/`
- [ ] Mover `src/main/store/` → `backend/store/`
- [ ] Mover `src/main/helpers/` → `backend/helpers/`
- [ ] Mover `tools/Mods_manager/events/` → `backend/events/mod-manager/`
- [ ] Mover `tools/Mods_manager/services/` → `backend/services/mod-manager/`
- [ ] Mover `tools/Mods_manager/proton-tools/main/` → `backend/services/proton-tools/`
- [ ] Mover `data/install-api/ForgePipeline/events/` → `backend/events/forge-pipeline/`
- [ ] Mover `data/install-api/ForgePipeline/services/` → `backend/services/forge-pipeline/`
- [ ] Mover `data/install-api/proton_recommended/services/` → `backend/services/proton-recommendation/`
- [ ] Mover `data/install-api/AddGame/` → `backend/services/add-game/`
- [ ] **Verificar**: `npm run build` + abrir app

### Fase 7: Mover Python Backend
- [ ] Mover `tools/Mods_manager/core/` → `backend/python/`
- [ ] Mover `tools/Mods_manager/games/` (26 game configs Python) → `backend/python/Games/`
- [ ] Mover `data/install-api/proton_recommended/python/` → `backend/python/proton-recommendation/`
- [ ] Mover `tools/prefix/` → `backend/python/prefix/` (ou manter separado)
- [ ] Mover `tools/game_launcher/` → `backend/python/game-launcher/`
- [ ] Mover `tools/emulators/` (Python parts) → `backend/python/emulators/`
- [ ] Mover `tools/python-rpc/` → `backend/python/rpc/`
- [ ] **Verificar**: `npm run build` + abrir app + testar Play em um jogo

### Fase 8: Mover Game Modules
- [ ] Mover `tools/Mods_manager/games/` (TypeScript: registry, 34 game dirs, _shared/) → `games/`
- [ ] Mover `tools/Mods_manager/types/` → `games/types/` (ou `UI/shared/types/`)
- [ ] Mover `tools/Mods_manager/data/` → `games/data/`
- [ ] **Verificar**: `npm run build` + abrir app

### Fase 9: Mover Bootstrap
- [ ] Mover `data/Bootstrap/` → `backend/bootstrap/`
- [ ] Mover `src/main/bootstrap.ts` → `backend/bootstrap/index.ts`
- [ ] **Verificar**: `npm run build` + abrir app

### Fase 10: Atualizar Configs de Build
- [ ] Atualizar `electron.vite.config.ts` com todos os novos paths
- [ ] Atualizar `config/tsconfig.web.json` com paths da UI
- [ ] Atualizar `config/tsconfig.node.json` com paths do backend
- [ ] Atualizar `package.json` (main entry point)
- [ ] Atualizar `electron-builder.yml` se necessário
- [ ] **Verificar**: `npm run build` + abrir app + testar todas as abas

### Fase 11: Limpeza Final
- [ ] Remover diretórios vazios (`src/`, `tools/` se vazio)
- [ ] Verificar que nenhum import está quebrado
- [ ] Rodar lint/typecheck se existir
- [ ] Testar: Home, Catálogo, Downloads, Games, Proton Tools, Mod Manager, Settings, Emulators
- [ ] Testar: Play em um jogo, Download de um jogo, Deploy de mods
- [ ] Atualizar `PLANO_REORGANIZACAO.md` com status final

---

## Regras durante a reorganização

1. **NUNCA pular fases** — cada fase deve ser verificada antes da próxima
2. **Compilar depois de CADA fase** — `npm run build` tem que passar
3. **Abrir o app depois de CADA fase** — verificar que as abas carregam
4. **Se algo quebrar** — reverter a fase e investigar antes de continuar
5. **Atualizar imports** — quando mover um arquivo, atualizar todos os imports que nele referenciam
6. **Path aliases** — atualizar `electron.vite.config.ts` e tsconfig a cada mudança de path
7. **Não mexer em**: `native/`, `resources/`, `data/catalogs/`, `data/games-data/`, `data/price-cache/`, `data/releases/`, `data/cache/`, `data/logs/`

---

## Mapeamento de Imports (referência rápida)

| Alias antigo | Caminho antigo | Novo caminho |
|---|---|---|
| `@renderer/*` | `src/renderer/src/*` | `UI/renderer/*` |
| `@locales` | `src/locales/index.ts` | `UI/shared/locales/index.ts` |
| `@shared` | `src/shared/index.ts` | `UI/shared/shared/index.ts` |
| `@types` | `src/types/index.ts` | `UI/shared/types/index.ts` |
| `@main/*` | `src/main/*` | `backend/*` |
| `@mods/*` | `tools/Mods_manager/*` | `UI/pages/mod-manager/*` (UI) ou `backend/*` (events/services) |
| `@proton/*` | `tools/Mods_manager/proton-tools/*` | `UI/pages/proton-tools/*` (renderer) ou `backend/services/proton-tools/*` (main) |
| `@provision/*` | `data/install-api/*` | Diversos (verificar por arquivo) |
| `@prefix/*` | `tools/prefix/*` | `backend/python/prefix/*` |
| `@game-launcher/*` | `tools/game_launcher/*` | `backend/python/game-launcher/*` |
| `@emulators/*` | `tools/emulators/*` | `backend/python/emulators/*` |
| `@bootstrap/*` | `data/Bootstrap/*` | `backend/bootstrap/*` |
| `@games/*` | `tools/Mods_manager/games/*` | `games/*` |
| `@resources` | `resources` | `resources` (não muda) |

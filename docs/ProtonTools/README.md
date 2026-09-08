# ProtonTools

Gerenciador de ferramentas de compatibilidade (Proton, Wine, DXVK, VKD3D), permitindo navegar, baixar, instalar e gerenciar múltiplos forks e versões.

## Architecture

Separado em dois layers:
- **`main/`** — Processo principal (Node/Electron): serviços de download, extração, instalação e definições dos tools
- **`renderer/`** — Processo renderer (React): UI e hooks

## Main Component (Renderer)

- **`ProtonTools (index.tsx)`** — Página com 4 abas: Tools (navegação), Downloads (progresso ativo), Installed (instalados), Games (mapeamento por jogo). Usa `useProtonTools` hook para todo o estado.

## Sub-Components (Renderer)

| Component | File | Role |
|---|---|---|
| `VersionList` | `components/version-list/` | Lista de versões com botões de download/selecionar/abrir pasta/info |
| `DownloadProgress` | `components/download-progress/` | Barra de progresso de downloads ativos |
| `ProtonInfoModal` | `components/proton-info-modal/` | Modal com informações detalhadas do tool (features, changelog, links) |
| `GamesTab` | `components/games-tab/` | Mapeamento de Proton por jogo Steam |
| `PrefixProgressModal` | `components/prefix-progress-modal/` | Progresso de criação de prefixo |
| `ProtonPathPicker` | `components/proton-path-picker/` | Seletor de caminho de Proton |
| `ProtonDBBadge` | `components/protondb-badge/` | Badge de compatibilidade ProtonDB |
| `ProtonDBSection` | `components/protondb-section/` | Seção de relatório ProtonDB |

## Services (Main)

### `tools.ts`
- Catálogo de **20+ tools** cadastrados: Valve Proton, Proton-GE, CachyOS, DW-Proton, EM, TKG, Sarek, UMU, Lina, Plop, SpeedHack, Luxtorpeda, Boxtron, Roberta, Steam Tinker Launch, Wine (Vanilla/Staging/TKG), DXVK, DXVK-GPLAsync, VKD3D-Proton
- Cada tool define: `id`, `title`, `description`, `category`, `endpoint` (GitHub/Forgejo/GitLab), `assetPosition`, `directoryNameFormat`, `type`, `extra` (features, author, license)
- Funções utilitárias: `findToolIdByForkName()`, `formatDirName()`, `findToolByFolder()`

### `db.ts`
- Operações de banco de dados SQLite para ferramentas

### `downloader.ts` / `extractor.ts` / `installer.ts`
- Pipeline: download → extração → instalação no diretório de compat tools

### Events (Main)
- `get-proton-db.ts` — Consulta à banco de dados
- `get-fork-catalog.ts` — Catálogo de forks
- `install-game-with-proton.ts` — Instalação de jogo com Proton selecionado
- `analyze-game-exe.ts` — Análise de executável
- `recommend-proton.ts` — Recomendação inteligente

## Hooks (Renderer)

- **`useProtonTools()`** — Estado central: abas, downloads, instalados, expansão, info modal, seleção
- **`useReleases()`** — Cache de releases carregados via API
- **`useGamesTab()`** — Jogos Steam e seus Protons

## IPC / Backend

- `window.electron.getProtonTools()` / `getInstalledProtonTools()`
- `window.electron.downloadProtonTool(toolId, release)`
- `window.electron.removeProtonTool(toolId, toolPath)`
- `window.electron.getProtonReleases(toolId)`
- `window.electron.syncSteamLibrary()` / `getSteamGameProton()` / `setSteamGameProton()`
- Eventos customizados: `proton-download-progress`, `proton-download-complete`

## Routing

- Rota `/proton-tools`

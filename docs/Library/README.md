# Library

Biblioteca de jogos do usuário com visualização em grade, filtros por coleção, ordenação e gerenciamento de coleções.

## Main Component

- **`library.tsx`** — Gerencia 3 modos de visão (compact/grid/large), ordenação (título, recente, mais jogado, instalado), filtro por coleção via URL search params, contexto de jogos, renomear/excluir coleções.

## Sub-Components

| Component | File | Role |
|---|---|---|
| `LibraryGameCard` | `library-game-card.tsx` | Card compacto com fallback de imagem (4 níveis: customIcon → cover → library → icon), playtime |
| `LibraryGameCardLarge` | `library-game-card-large.tsx` | Card grande com hero background, logo, barras de tamanho instalador/instalado |
| `ViewOptions` | `view-options.tsx` | Seletor de modo visual: compact (ícones), grid, large (cards grandes) |
| `FilterOptions` | `filter-options.tsx` | Dropdown de ordenação (título, recente, mais jogado, instalado, título desc) |
| `GameContextMenu` | `@components` | Menu de contexto do jogo (jogar, properties, etc.) |

## Collections

- Coleções são gerenciadas via REST API em `/profile/games/collections/`
- Coleção especial `__favorites__` (favoritos) é tratada inline sem chamada à API
- Context menu em coleções permite renomear e excluir

## Hooks / State

- **`useLibrary()`** — Hook global de biblioteca
- **`useGameCollections()`** — Carrega coleções do usuário
- **Redux**: `state.library.searchQuery` para busca textual com `useDeferredValue`
- Configurações de visão e ordenação persistidas em `localStorage`

## IPC / Backend

- `window.electron.forgerApi.put/patch/delete` — CRUD de coleções via API REST
- `window.electron.onLibraryBatchComplete` — Callback de atualização batch
- `window.electron.refreshLibraryAssets()` — Atualização de imagens/metadados

## Routing

- Rota `/library` (ou raiz via sidebar)
- Coleção selecionada via `?collection=<id>` nos search params

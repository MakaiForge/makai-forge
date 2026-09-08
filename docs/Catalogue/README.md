# Catalogue

Catálogo de jogos pesquisável e filtrável, integrado com múltiplas fontes de download (Steam + fontes de terceiros).

## Main Component

- **`Catalogue (index.tsx)`** — Layout de duas colunas: resultados de pesquisa (esquerda) e filtros (direita). Gerencia paginação, busca com debounce, filtros ativos com tags removíveis.

## Sub-Components

| Component | File | Role |
|---|---|---|
| `GameItem` | `components/game-item/` | Card de jogo no grid de resultados |
| `FilterSection` | `components/filter-section/` | Seção de filtro agrupada (gêneros, tags, fontes, devs, publishers) |
| `FilterItem` | `components/filter-item/` | Tag de filtro ativo com botão de remover |
| `Pagination` | `components/pagination/` | Paginação de resultados |
| `ProtonDBBadge` | `components/protondb-badge/` | Badge de compatibilidade |

## Hooks

- **`useCatalogueSearch()`** (`hooks/useCatalogueSearch.ts`) — Busca com debounce de 500ms, integração com dados "pirate" (fontes de terceiros), cancelamento de requisições concorrentes via `requestSequenceRef`, refetch ao desbloquear suplemento (`supplemental-unlocked` event)
- **`useCatalogueFilters()`** (`hooks/useCatalogueFilters.ts`) — Filtros agrupados por categoria com cores, mapeamento de gêneros Steam (multi-idioma), tags, fontes de download, desenvolvedores e publishers

## Redux State

- `state.catalogueSearch.filters` — Objeto com `title` (string), `genres`/`tags`/`downloadSourceFingerprints`/`developers`/`publishers` (arrays)
- `state.catalogueSearch.page` — Página atual
- Actions: `setFilters()`, `setPage()` via `@features`

## Types

- `PAGE_SIZE = 20` — Itens por página
- `CURATED_GENRES` — 15 gêneros curados
- `filterCategoryColors` — Cores por categoria de filtro (hsl)

## IPC / Backend

- `window.electron.forgerApi.post("/catalogue/search")` — Busca paginada (POST com filters, downloadSourceIds, hideExplicitContent)
- `window.electron.getGameDataBatch()` — Dados de terceiros para enriquecer resultados (download sources extras)
- Evento `supplemental-unlocked` — Refetch automático quando nova fonte é desbloqueada

## Routing

- Rota `/catalogue` ou `/games`

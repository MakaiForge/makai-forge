# Home

Página inicial do aplicativo, exibindo notícias de Linux gaming, promoções e jogos grátis.

## Main Component

- **`home.tsx`** — Componente principal com dois modos de visualização: "Início" (news/deals/free games) e "Navegador" (webview embutido). Gerencia abas e estado de carregamento via `useHomeData`.

## Sub-Components

| Component | File | Role |
|---|---|---|
| `NewsCarousel` | `components/news-carousel/` | Carrossel automático (7s) de artigos em destaque com navegação e miniaturas |
| `FeaturedDeals` | `components/featured-deals/` | Grade de promoções em destaque com `DealCard` |
| `FreeGames` | `components/free-games/` | Seção de jogos grátis com `FreeGameCard` |
| `BrowserView` / `BrowserViewEmpty` | `@components/browser-view` | Webview Chromium para leitura de artigos inline |

## Hooks

- **`useHomeData(userLang)`** (`hooks/useHomeData.ts`) — Carrega dados em duas fases: cache local (`getHomeDealsCached`/`getLinuxNewsCached`/`getFreeGamesCached`) e fresco via API. Gerencia refresh a cada 3h. Controla abas e artigo pendente para o navegador.

## Utils

- **`utils/formatters.ts`** — `formatTimeAgo()`, `makeTranslateUrl()` para tradução automática via Google Translate.

## IPC / Backend

- `window.electron.getHomeDeals()` / `getHomeDealsCached()` — Promoções de lojas
- `window.electron.getLinuxNews(userLang)` / `getLinuxNewsCached()` — Artigos de notícias
- `window.electron.getFreeGames(userLang)` / `getFreeGamesCached()` — Jogos gratuitos
- `window.electron.openExternal(url)` — Abrir link no navegador do sistema

## Routing

- Renderizada em `/` (rota raiz)
- Aba "Navegador" exibe um `BrowserView` com a URL do artigo selecionado

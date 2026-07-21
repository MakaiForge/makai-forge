# Análise de Melhorias — Aba Games

> **Contexto:** `src/renderer/src/pages/games/` — Página principal de jogos do ProtonForge.
> **Data da análise:** Maio 2026

---

## Item #1 — Feedback visual quando sincronização Steam falha

**Severidade:** Média  
**Arquivo:** `src/renderer/src/pages/games/games.tsx:135-145` e `278-280`

### Problema

A função `handleSyncSteam` executa a sincronização da biblioteca Steam. Chamada:
1. Automaticamente ao montar a página (`useEffect` linha 278)
2. Manualmente pelo botão "Sincronizar Steam"

Em caso de falha, o erro vai só pro `console.error`. O usuário **não recebe nenhum feedback visual** — não sabe se:
- A sincronização falhou por problemas de rede
- O Steam não está rodando
- A biblioteca está vazia
- Houve um erro interno

### Solução

Usar `useToast` → `showErrorToast` / `showSuccessToast` (já existente no app, usado em 17+ lugares):

```typescript
import { useAppDispatch, useToast } from "@renderer/hooks";

// No componente:
const { showErrorToast, showSuccessToast } = useToast();

// No handleSyncSteam:
try {
  const games = await window.electron.syncSteamLibrary();
  setSteamGames(games);
  if (games.length === 0) {
    showSuccessToast("Steam sincronizada", "Nenhum jogo Steam encontrado.");
  } else {
    showSuccessToast("Steam sincronizada", `${games.length} jogo(s) encontrado(s).`);
  }
} catch (err) {
  showErrorToast("Falha na sincronização",
    "Não foi possível sincronizar sua biblioteca Steam. Verifique se o Steam está rodando.");
}
```

### Status

✅ **Implementado** — Alterações aplicadas em `games.tsx` (import + hook + toasts).

---

## Item #2 — `steamConfigs` é código morto

**Severidade:** Baixa  
**Arquivo:** `src/renderer/src/pages/games/games.tsx:357`

### Problema

```typescript
const steamConfigs = filteredSteam.map(steamToGameConfig);
```

Esta variável é calculada a cada renderização mas **nunca é lida** em lugar nenhum. É processamento desperdiçado.

### Solução

Remover a linha.

### Prévia da mudança

```diff
- const steamConfigs = filteredSteam.map(steamToGameConfig);
```

---

## Item #3 — Busca por `appId` com `includes` pode dar falso positivo

**Severidade:** Baixa  
**Arquivo:** `src/renderer/src/pages/games/games.tsx:349`

### Problema

```typescript
g.appId.includes(searchQuery)
```

Se o usuário digitar "1", matcha todo jogo Steam que contém "1" no appId (ex: 7, 10, 100, 21...). Além disso, se `searchQuery` não for numérico, a comparação sempre falha mas sem erro visível.

### Solução

Se a intenção é busca por appId exato, usar `===`. Se não for útil, remover a condição.

### Prévia da mudança

```diff
- g.appId.includes(searchQuery)
+ // Opção A: remover completamente
+ // Opção B: busca exata
+ (!isNaN(Number(searchQuery)) && g.appId === searchQuery)
```

---

## Item #4 — `setTimeout(50ms)` como workaround de race condition

**Severidade:** Média  
**Arquivos:** `games.tsx:149` e `use-games.ts:119`

### Problema

```typescript
setLaunchingGameIds((prev) => new Set(prev).add(gameId));
await new Promise((r) => setTimeout(r, 50));  // ← hack
await window.electron.openGame(...);
```

O `setTimeout(50ms)` entre o `setLaunchingGameIds` e o `openGame` é um workaround para garantir que o React tenha processado o estado antes de prosseguir. Se `openGame` falhar rápido, o `launchingGameIds` pode nunca ser limpo.

### Solução

Trocar para `flushSync()` do `react-dom` ou refatorar para que o `launchingGameIds` seja atualizado **após** confirmação do lançamento, não antes. Ou usar um callback no IPC que confirme que o processo foi iniciado.

### Prévia da mudança

```typescript
// Em vez de setTimeout:
import { flushSync } from "react-dom";

// Opção: atualizar estado depois da chamada
await window.electron.openGame(...);
// Só marca como "launching" se a chamada não lançou erro
setLaunchingGameIds((prev) => new Set(prev).add(gameId));
```

---

## Item #5 — Zero testes automatizados

**Severidade:** Alta  
**Arquivo:** `src/renderer/src/pages/games/**/*.test.ts` — nenhum encontrado

### Problema

Não existe nenhum arquivo de teste na árvore `games/`. Qualquer refatoração, correção de bug ou adição de funcionalidade é feita sem garantia de regressão.

### Solução

- Adicionar testes unitários para `useGames` hook (cenários: carregar jogos, favoritar, deletar, buscar)
- Adicionar testes de renderização para `GameCompactRow`, `GameLargeCard`, `GamesToolbar`, `GameBar`
- Adicionar teste de integração para o fluxo de sync Steam + exibição

---

## Item #6 — Estado `loading` do `useGames` ignorado no JSX

**Severidade:** Média  
**Arquivo:** `src/renderer/src/pages/games/games.tsx` (em todo o JSX)

### Problema

O hook `useGames` retorna `loading` (linha 109) que é setado como `true` durante o carregamento e `false` no final. Porém, no JSX da página ele **nunca é usado**. Não há skeleton, spinner ou qualquer feedback de carregamento. O usuário vê tela vazia até os jogos aparecerem.

### Solução

Adicionar um estado de carregamento condicional:

```typescript
{loading && (
  <div className="games__loading">
    <Spinner />
    <p>Carregando biblioteca...</p>
  </div>
)}
```

---

## Item #7 — `clearPrefix` indisponível para jogos locais

**Severidade:** Baixa  
**Arquivo:** `src/renderer/src/pages/games/components/game-bar.tsx:176`

### Problema

```typescript
{game.runner === "steam" && onClearPrefix && (
  <button onClick={onClearPrefix}>🧹 Limpar Prefixo</button>
)}
```

A opção de limpar prefixo só aparece para jogos Steam. Jogos locais também têm prefixo Wine e poderiam se beneficiar desta funcionalidade.

### Solução

Remover a condição `game.runner === "steam"` ou estender para incluir jogos locais com prefixo:

```diff
- {game.runner === "steam" && onClearPrefix && (
+ {onClearPrefix && (
```

---

## Item #8 — `GameContextMenu` sem opção `onStop`

**Severidade:** Baixa  
**Arquivo:** `src/renderer/src/pages/games/games.tsx:716-728`

### Problema

O `GameContextMenu` renderizado não recebe um handler `onStop`. Quando o jogo está rodando, o menu de contexto (clique direito) não oferece opção de pará-lo. O `GameBar` tem essa opção, mas o context menu não.

### Solução

Adicionar `onStop` ao `GameContextMenu` e exibir condicionalmente quando o jogo estiver em execução.

---

## Item #9 — Busca sem resultados não mostra mensagem

**Severidade:** Média  
**Arquivo:** `src/renderer/src/pages/games/games.tsx:361-362`

### Problema

```typescript
const showEmpty = !loading && !hasSteamGames && !hasLocalGames && !searchQuery;
```

`showEmpty` só é `true` quando **não há busca E não há jogos**. Se o usuário digitar algo que não encontra resultado, as seções Steam e Local simplesmente não renderizam, e a tela fica em branco sem nenhuma mensagem.

### Solução

Adicionar estado para "busca sem resultados":

```typescript
const hasSearchWithNoResults = searchQuery && !hasSteamGames && !hasLocalGames;
// No JSX:
{hasSearchWithNoResults && (
  <div className="games__empty">
    <h3>Nenhum resultado para "{searchQuery}"</h3>
    <p>Tente termos diferentes ou verifique a ortografia.</p>
  </div>
)}
```

---

## Item #10 — `syncLabel` hardcoded em português sem i18n

**Severidade:** Baixa  
**Arquivo:** `src/renderer/src/pages/games/games.tsx:375-377`

### Problema

```typescript
const syncLabel = syncing ? "Sincronizando..." : "Sincronizar Steam";
```

O resto da página usa `t()` do i18next para textos, mas o label do botão de sincronização é literal em português. Se o app for usado em outro idioma, esse texto vai ficar em português.

### Solução

Usar `t()`:

```typescript
const syncLabel = syncing ? t("syncing", "Sincronizando...") : t("sync_steam", "Sincronizar Steam");
```

---

## Item #11 — Handlers de Wine Tools que podem não fazer nada silenciosamente

**Severidade:** Média  
**Arquivo:** `src/renderer/src/pages/games/games.tsx:174-183` e `game-bar.tsx:705-712`

### Problema

```typescript
const handleWineTool = useCallback((tool: string) => {
  if (selectedSteamGame) {
    runWineTool(steamToGameConfig(selectedSteamGame), tool);
  } else if (selectedGame) {
    runWineTool(selectedGame, tool);
  }
  // Se ambos forem null, nada acontece silenciosamente
}, [selectedSteamGame, selectedGame, runWineTool]);
```

E `runWineTool` no `use-games.ts:277-287`:
```typescript
const runWineTool = useCallback(async (game: GameConfig, tool: string) => {
  try {
    await window.electron.runWineTool(game.shop, game.objectId, tool);
  } catch (error) {
    console.error("Failed to run wine tool:", error);
  }
}, []);
```

Se o tool não estiver implementado no backend, o usuário clica e nada acontece. Sem toast de erro, sem feedback.

### Solução

Adicionar toast de erro no `catch` do `runWineTool`, e garantir que `handleWineTool` sempre tenha um `activeGame` válido (não seja null).

---

## Item #12 — Botão "Wine" no GameBar com nome ambíguo

**Severidade:** Baixa  
**Arquivo:** `src/renderer/src/pages/games/components/game-bar.tsx:112-114`

### Problema

```typescript
<button className="game-bar__wine-button" onClick={onConfigure}>
  Wine
</button>
```

O botão abre o modal de configuração do jogo, mas se chama "Wine". Um usuário novo pode pensar que é pra abrir o Wine ou uma ferramenta Wine, não para configurar o jogo inteiro.

### Solução

Renomear para "Configurar" ou "Configurações do Jogo".

### Prévia da mudança

```diff
- Wine
+ Configurar
```

---

## Item #13 — `handlePlaySteam` com closure potencialmente desatualizado

**Severidade:** Média  
**Arquivo:** `src/renderer/src/pages/games/games.tsx:147-172`

### Problema

O `useCallback` de `handlePlaySteam` tem array de dependências **vazio** (`[]`, linha 172). Dentro dele, `setLaunchingGameIds` é usado com função updater `(prev) => ...` (o que é correto para evitar stale state). Porém, se a implementação mudar no futuro para depender de alguma variável externa, isso vai quebrar silenciosamente.

Além disso, se `openExternal` jogar um erro que não seja um `Error` padrão (ex: string), o `console.error("Failed to launch Steam game", err)` pode não mostrar a informação correta.

### Solução

Manter o `[]` vazio intencionalmente com um comentário documenting, e garantir que `setLaunchingGameIds` sempre use função updater (já faz). Adicionar tratamento para tipos de erro não padrão.

---

## Item #14 — Dois `addEventListener` em `useEffect` separados

**Severidade:** Muito Baixa  
**Arquivo:** `src/renderer/src/pages/games/hooks/use-games.ts:75-86`

### Problema

```typescript
useEffect(() => {
  const handler = () => loadGames();
  window.addEventListener("protonforge:game-removed-from-library", handler);
  return () => window.removeEventListener(...);
}, [loadGames]);

useEffect(() => {
  const handler = () => loadGames();
  window.addEventListener("protonforge:game-favorite-toggled", handler);
  return () => window.removeEventListener(...);
}, [loadGames]);
```

Dois `useEffect` que fazem exatamente a mesma coisa (registrar listener que chama `loadGames`). Poderiam ser um só.

### Solução

```typescript
useEffect(() => {
  const handler = () => loadGames();
  const events = ["protonforge:game-removed-from-library", "protonforge:game-favorite-toggled"];
  events.forEach((event) => window.addEventListener(event, handler));
  return () => events.forEach((event) => window.removeEventListener(event, handler));
}, [loadGames]);
```

---

## Item #15 — Fallback de imagem Steam com SVG inline no JSX

**Severidade:** Muito Baixa  
**Arquivo:** `src/renderer/src/pages/games/games.tsx:516-519`

### Problema

```typescript
onError={(e) => {
  (e.target as HTMLImageElement).src =
    "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='460' height='215'>..."
}}
```

A string SVG de fallback está inline no JSX, poluindo o componente e não sendo reutilizável.

### Solução

Extrair para constante fora do componente:

```typescript
const FALLBACK_IMAGE = "data:image/svg+xml,...";
```

Ou usar um componente `<GameImage>` compartilhado que centraliza a lógica de fallback.

---

## Item #16 — Fallback de imagem Local manipula o DOM diretamente

**Severidade:** Média  
**Arquivo:** `src/renderer/src/pages/games/games.tsx:625-634`

### Problema

```typescript
onError={(e) => {
  (e.target as HTMLImageElement).style.display = "none";
  const parent = (e.target as HTMLImageElement).parentElement;
  if (parent) {
    const placeholder = document.createElement("div");
    placeholder.className = "games__steam-card-placeholder";
    placeholder.textContent = game.title.charAt(0).toUpperCase();
    parent.appendChild(placeholder);
  }
}}
```

Manipulação direta do DOM (`document.createElement`, `appendChild`) dentro de um componente React. Isso foge do ciclo de vida do React e pode causar inconsistência entre o virtual DOM e o DOM real, especialmente se o componente re-renderizar.

### Solução

Usar estado React para controlar a exibição do placeholder:

```typescript
const [imageError, setImageError] = useState(false);

// No JSX:
{imageError || !localGameCoverUrl(game) ? (
  <div className="games__steam-card-placeholder">
    {game.title.charAt(0).toUpperCase()}
  </div>
) : (
  <img src={localGameCoverUrl(game)!} onError={() => setImageError(true)} />
)}
```

---

## Item #17 — `localGameCoverUrl` usa `(game as any).libraryImageUrl`

**Severidade:** Baixa  
**Arquivo:** `src/renderer/src/pages/games/games.tsx:46`

### Problema

```typescript
function localGameCoverUrl(game: GameConfig): string | null {
  return (
    game.coverImageUrl ||
    game.libraryHeroImageUrl ||
    (game as any).libraryImageUrl ||  // ← tipo inseguro
    game.iconUrl ||
    null
  );
}
```

`libraryImageUrl` não existe na interface `GameConfig`. O cast `as any` esconde o erro de tipo. Se essa propriedade for necessária, deveria ser adicionada à interface. Se não existir em nenhum jogo real, essa linha é código morto.

### Solução

Adicionar `libraryImageUrl?: string` à interface `GameConfig` em `games-service.ts`, ou remover a linha se não for usada.

---

## Item #18 — Favoritar jogo Steam não persiste no estado local

**Severidade:** Alta  
**Arquivo:** `src/renderer/src/pages/games/hooks/use-games.ts:166-191` e `games.tsx`

### Problema

O hook `favoriteGame` só opera em `GameConfig` (jogos locais). Não há mecanismo para favoritar um `SteamInstalledGame` (jogos da Steam). O `GameBar` passa `onFavorite` apenas para jogos locais (`selectedGame`), e o menu de contexto Steam não tem opção de favoritar.

### Solução

Adicionar suporte a favoritos para jogos Steam, seja persistindo localmente (no nível/JSON) ou integrando com os favoritos do Steam via API.

---

## Resumo por severidade

| Severidade | Itens |
|---|---|
| **Alta** | #5 (sem testes), #18 (favoritar Steam) |
| **Média** | #1 (feedback sync), #4 (setTimeout), #6 (loading), #9 (busca sem resultado), #11 (Wine tools silenciosos), #13 (closure), #16 (DOM direto) |
| **Baixa** | #2 (código morto), #3 (busca appId), #7 (clearPrefix), #8 (context menu), #10 (i18n), #12 (botão Wine), #17 (as any) |
| **Muito Baixa** | #14 (useEffect duplicado), #15 (SVG inline) |

---

## Arquivos afetados (visão geral)

| Arquivo | Itens |
|---|---|
| `src/renderer/src/pages/games/games.tsx` | #1, #2, #3, #4, #6, #8, #9, #10, #13, #15, #16, #17 |
| `src/renderer/src/pages/games/hooks/use-games.ts` | #4, #5, #14, #18 |
| `src/renderer/src/pages/games/components/game-bar.tsx` | #7, #11, #12 |
| `src/renderer/src/pages/games/services/games-service.ts` | #17 |
| Em toda a pasta `games/` | #5 (testes) |

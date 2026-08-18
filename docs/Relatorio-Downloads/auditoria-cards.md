# Auditoria — Componentes de Cards (`app/Games/components/cards/`)

> **Data:** 18/08/2026  
> **Objetivo:** Mapear, analisar e identificar problemas nos 4 componentes de card da aba Games.

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [SteamGridCard](#2-steamgridcard)
3. [LocalGridCard](#3-localgridcard)
4. [GameCompactRow](#4-gamecompactrow)
5. [GameLargeCard](#5-gamelargecard)
6. [SCSS — Estilos Compartilhados](#6-scss)
7. [Problemas Identificados](#7-problemas-identificados)
8. [Recomendações](#8-recomendações)

---

## 1. Visão Geral

```
app/Games/components/cards/
├── SteamGridCard.tsx      — Card de grid para jogos Steam
├── LocalGridCard.tsx      — Card de grid para jogos Locais
├── GameCompactRow.tsx     — Row compacta (lista)
├── GameLargeCard.tsx      — Card grande (hero)
├── cards.scss             — Estilos compartilhados
└── icons/
    └── SteamLogo.tsx      — Ícone SVG do Steam
```

### Relação com Modos de Visualização

| Modo | Componente | Usado por |
|------|-----------|-----------|
| `grid` (Steam) | `SteamGridCard` | `GamesSteamSection` |
| `grid` (Local) | `LocalGridCard` | `GamesLocalSection` |
| `compact` | `GameCompactRow` | `GamesLocalSection` / `GamesSteamSection` |
| `large` | `GameLargeCard` | `GamesLocalSection` / `GamesSteamSection` |

---

## 2. SteamGridCard

### Props

```typescript
interface Props {
  game: SteamInstalledGame;     // Dados do jogo Steam
  isSelected: boolean;          // Se está selecionado
  isLaunching: boolean;         // Se está iniciando
  hasError: boolean;            // Se a imagem falhou
  onPlay: () => void;           // Double-click → play
  onSelect: () => void;         // Click → selecionar
  onContextMenu: (e: React.MouseEvent) => void;
  onImageError: () => void;     // Imagem falhou
}
```

### Renderização

```
┌─────────────────────────────────┐
│  [Imagem Header Steam 460x215]  │ ← steamHeaderUrl(appId)
│  ─────────────────────────────  │
│  [▶ Overlay (hover)]            │
├─────────────────────────────────┤
│  Nome do Jogo                   │ ← game.name (13px, bold)
│  Steam  │  2.5 GB              │ ← badges
└─────────────────────────────────┘
```

### Comportamento

- **Click** → `onSelect()` (seleciona o jogo)
- **Double-click** → `onPlay()` (inicia o jogo)
- **Right-click** → `onContextMenu()` (menu contextual)
- **Hover** → borda branca + overlay com botão play
- **Selecionado** → borda accent (roxo)
- **Launching** → animação heartbeat (outline amarelo pulsante)

---

## 3. LocalGridCard

### Props

```typescript
interface Props {
  game: GameConfig;             // Dados do jogo local
  isSelected: boolean;
  isLaunching: boolean;
  hasError: boolean;
  onPlay: () => void;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onImageError: () => void;
}
```

### Renderização

```
┌─────────────────────────────────┐
│  [Imagem Cover Local]           │ ← localGameCoverUrl(game)
│  ─────────────────────────────  │
│  [▶ Overlay (hover)]            │
├─────────────────────────────────┤
│  Nome do Jogo                   │ ← game.title (13px, bold)
│  Local │ 📦 2.5GB │ 💾 5.1GB  │ ← badges (installer + installed)
└─────────────────────────────────┘
```

### Diferenças do SteamGridCard

1. **Imagem:** usa `localGameCoverUrl(game)` em vez de `steamHeaderUrl(appId)`
2. **Badge:** "Local" em vez de "Steam"
3. **Tamanhos:** mostra `installerSizeInBytes` E `installedSizeInBytes`
4. **Ícones:** usa `FileZipIcon` para installer e `DatabaseIcon` para installed

---

## 4. GameCompactRow

### Props

```typescript
interface CompactRowProps {
  thumbnail: string | null;
  title: string;
  runner: string;
  playTimeMs?: number;
  installerSize?: number | null;
  installedSize?: number | null;
  onPlay: () => void;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isSelected: boolean;
  isSteam?: boolean;
  appId?: string;
  pcRequirements?: { minimum?: string | null; recommended?: string | null } | null;
}
```

### Renderização

```
┌────┬──────────────────┬───────┬──────┬──────┬─────┬───────┬────┐
│ 🖼️ │ Nome do Jogo     │ Steam │ 📦   │ 💾   │ 2.5h│ Badge │ ▶  │
│    │                  │       │ 2.5G │ 5.1G │     │       │    │
└────┴──────────────────┴───────┴──────┴──────┴─────┴───────┴────┘
 46px     flex: 1          48px   72px  72px  56px   auto   28px
```

### Funcionalidades

- **Cache de detalhes Steam:** `steamDetailsCache` (Map global)
- **Busca automática:** se `isSteam` e `appId`, busca `getGameShopDetails`
- **CompatibilityBadge:** mostra requisitos mínimos/recomendados
- **Play button:** aparece no hover, `stopPropagation` para não selecionar

### Lógica de Detalhes

```
steamDetailsCache.has(appId)?
├── SIM → usa cache
└── NÃO → window.electron.getGameShopDetails(appId, "steam", "en")
    ├── Sucesso → salva no cache + setDetails
    └── Erro → ignora (silencioso)
```

---

## 5. GameLargeCard

### Props

```typescript
interface LargeCardProps {
  thumbnail: string | null;
  portraitUrl: string | null;
  title: string;
  runner: string;
  playTimeMs?: number;
  installerSize?: number | null;
  installedSize?: number | null;
  isSteam?: boolean;
  appId?: string;
  onPlay: () => void;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isSelected: boolean;
}
```

### Renderização

```
┌──────────────┬────────────────────────────────────────┐
│              │  Nome do Jogo                           │
│  [Portrait   │  2024 │ Steam │ Win/Mac/Linux │ 2.5GB  │
│   Art 200x   │  Developer Name                        │
│   300px]     │  Descrição curta do jogo...            │
│              │  [▶ Jogar]                              │
└──────────────┴────────────────────────────────────────┘
```

### Funcionalidades

- **Busca automática:** busca `getGameShopDetails` para detalhes
- **Exibe:** ano, developer, descrição, plataformas, requisitos
- **Portrait优先:** usa `portraitUrl` senão `thumbnail`
- **Play button:** sempre visível (não precisa hover)

---

## 6. SCSS — Estilos Compartilhados

### Paleta de Cores

```scss
// Fundo
--bg-card: #1b2838
--bg-overlay: rgba(0, 0, 0, 0.45)
--bg-info: rgba(255, 255, 255, 0.03)

// Texto
--text-title: rgba(255, 255, 255, 0.85)
--text-badge: rgba(255, 255, 255, 0.25)
--text-size: rgba(255, 255, 255, 0.25)
--text-hours: rgba(255, 255, 255, 0.3)

// Accent
--accent: #6366f1 (roxo)
--accent-gradient: linear-gradient(135deg, #6366f1, #4f46e5)

// Steam
--steam-bg: rgba(27, 40, 56, 0.8)
--steam-color: #66c0f4
```

### Animações

```scss
// Heartbeat (jogo iniciando)
@keyframes steam-card-heartbeat {
  0%   { outline: 3px solid rgba(255, 200, 0, 0.1); }
  15%  { outline: 4px solid rgba(255, 200, 0, 0.9); }
  22%  { outline: 3px solid rgba(255, 200, 0, 0.1); }
  30%  { outline: 4px solid rgba(255, 200, 0, 0.6); }
  37%  { outline: 3px solid rgba(255, 200, 0, 0.1); }
  100% { outline: 3px solid rgba(255, 200, 0, 0.1); }
}

// Hover scale (imagem)
.games__steam-card:hover .games__steam-card-img {
  transform: scale(1.03);
}
```

---

## 7. Problemas Identificados

### 🔴 CRÍTICOS

#### 7.1 `SteamGridCard` e `LocalGridCard` são quase idênticos

**Problema:** Os dois componentes compartilham ~90% do código:
- Mesma estrutura HTML
- Mesmas classes CSS
- Mesmas props (exceto `game` type)
- Mesmo comportamento

**Impacto:** Manutenção duplicada. Qualquer mudança precisa ser feita em 2 lugares.

**Solução:** Criar um `GameGridCard` genérico que aceita `SteamInstalledGame | GameConfig`.

---

#### 7.2 `GameCompactRow` usa `steamDetailsCache` global sem limites

```typescript
const steamDetailsCache = new Map<string, any>();
```

**Problema:** O cache cresce indefinidamente durante a vida do app. Cada entrada é um objeto de detalhes do Steam.

**Impacto:** Memory leak (cada entry pode ter ~5-10KB).

**Solução:** Usar LRU cache ou limitar a 100 entries.

---

### 🟡 MÉDIOS

#### 7.3 `GameCompactRow` busca detalhes sem debounce

```typescript
useEffect(() => {
  if (!isSteam || !appId || pcRequirements) return;
  if (steamDetailsCache.has(appId)) {
    setDetails(steamDetailsCache.get(appId));
    return;
  }
  window.electron.getGameShopDetails(appId, "steam", "en")
    .then((data: any) => { ... })
    .catch(() => {});
}, [isSteam, appId, pcRequirements]);
```

**Problema:** Se o componente re-renderiza muitas vezes (ex: scroll rápido), pode disparar múltiplas chamadas IPC para o mesmo `appId`.

**Impacto:** Requests redundantes, possível rate limiting.

**Solução:** Debounce de 300ms ou usar `useDeferredValue`.

---

#### 7.4 `GameLargeCard` não usa cache de detalhes

```typescript
useEffect(() => {
  if (!isSteam || !appId) return;
  window.electron.getGameShopDetails(appId, "steam", "en")
    .then((data: any) => { if (!cancelled) setDetails(data); })
    .catch(() => {});
}, [isSteam, appId]);
```

**Problema:** Diferente do `GameCompactRow`, o `GameLargeCard` NÃO usa cache. Se o usuário alterna entre visualizações, busca detalhes novamente.

**Impacto:** Requests desnecessários, lentidão ao alternar modos.

**Solução:** Usar o mesmo `steamDetailsCache` do `GameCompactRow`.

---

#### 7.5 `LocalGridCard` usa `localGameCoverUrl(game)!` com non-null assertion

```typescript
{localGameCoverUrl(game) && !hasError ? (
  <img src={localGameCoverUrl(game)!} ... />
) : ( ... )}
```

**Problema:** Chama `localGameCoverUrl(game)` DUAS vezes — uma no check e outra no src. Se o estado mudar entre as chamadas, pode usar um valor diferente.

**Impacto:** Bug raro mas possível (race condition).

**Solução:** Usar variável:
```typescript
const coverUrl = localGameCoverUrl(game);
{coverUrl && !hasError ? <img src={coverUrl} ... /> : ...}
```

---

#### 7.6 `GameCompactRow` não trata erro de `getGameShopDetails`

```typescript
window.electron.getGameShopDetails(appId, "steam", "en")
  .then((data: any) => { ... })
  .catch(() => {});  // ← ignora erro silenciosamente
```

**Problema:** Se a chamada falhar (rede, API down), o erro é engolido. O componente fica sem detalhes sem feedback.

**Impacto:** Usuário não vê requisitos sem saber por quê.

**Solução:** Log do erro ou estado de erro.

---

### 🟢 MENORES

#### 7.7 `SteamLogo` não é usado em nenhum card

```typescript
// icons/SteamLogo.tsx
export function SteamLogo({ size = 16 }: { size?: number }) { ... }
```

**Problema:** O ícone existe mas não é importado por nenhum dos 4 cards.

**Impacto:** Código morto.

---

#### 7.8 `cards.scss` usa `color-mix()` sem fallback

```scss
&:hover {
  background: color-mix(in srgb, var(--accent, #6366f1) 20%, transparent);
}
```

**Problema:** `color-mix()` não é suportado em navegadores antigos (Chrome < 111, Firefox < 113).

**Impacto:** Hover pode não funcionar em versões anteriores do Chromium (Electron antigo).

---

#### 7.9 `GameLargeCard` não mostra `CompatibilityBadge` para jogos locais

```typescript
{isSteam && pcRequirements?.minimum && (
  <CompatibilityBadge ... />
)}
```

**Problema:** O badge de compatibilidade só aparece para jogos Steam, mesmo que jogos locais tenham `pcRequirements`.

**Impacto:** Informação faltando para jogos locais com requisitos conhecidos.

---

#### 7.10 `GameCompactRow` tem `title` no botão play muito longo

```typescript
<button
  className="game-compact-row__play"
  title="Aba Games: inicializa apenas o jogo (SEM mods). Para jogar com mods habilitados, use o Mod Manager (▶ Iniciar Jogo)."
>
```

**Problema:** O `title` (tooltip) tem 130+ caracteres. Em alguns Sistemas Operacionais, tooltips longos são truncados ou aparecem com layout ruim.

**Impacto:** UX ruim em Sistemas Operacionais diferentes.

---

## 8. Recomendações

### Prioridade Alta

1. **Unificar `SteamGridCard` e `LocalGridCard`** — Criar `GameGridCard` genérico
2. **Adicionar LRU cache** para `steamDetailsCache`
3. **Reusar cache** entre `GameCompactRow` e `GameLargeCard`

### Prioridade Média

4. **Debounce** nas buscas de detalhes Steam
5. **Evitar non-null assertion** em `LocalGridCard`
6. **Tratar erros** de `getGameShopDetails`
7. **Adicionar fallback** para `color-mix()`

### Prioridade Baixa

8. **Remover `SteamLogo`** se não é usado
9. **Simplificar tooltip** do botão play
10. **Mostrar `CompatibilityBadge`** para jogos locais

---

## Resumo

| Componente | Linhas | Props | Problemas |
|------------|--------|-------|-----------|
| `SteamGridCard` | ~50 | 8 | Duplicado com Local |
| `LocalGridCard` | ~55 | 8 | Duplicado com Steam |
| `GameCompactRow` | ~100 | 12 | Cache sem limite |
| `GameLargeCard` | ~90 | 11 | Sem cache |
| `cards.scss` | ~200 | — | color-mix sem fallback |
| `SteamLogo` | ~20 | 1 | Código morto |
| **Total** | **~515** | | **10 problemas** |

# Auditoria — Toolbar (`app/Games/components/toolbar/`)

> **Data:** 18/08/2026  
> **Objetivo:** Mapear, analisar e identificar problemas no toolbar da aba Games.

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [TopBar](#2-topbar)
3. [GamesToolbar](#3-gamestoolbar)
4. [SCSS — Estilos](#4-scss)
5. [Problemas Identificados](#5-problemas-identificados)
6. [Recomendações](#6-recomendações)

---

## 1. Visão Geral

```
app/Games/components/toolbar/
├── TopBar.tsx       — Barra superior (container)
├── Toolbar.tsx      — Toolbar intern controles)
└── toolbar.scss     — Estilos
```

### Hierarquia de Componentes

```
Games (index.tsx)
└── GamesTopBar (TopBar.tsx)
    ├── Título: "Meus Jogos"
    ├── Divisor
    ├── GamesToolbar (Toolbar.tsx)
    │   ├── TextField (busca)
    │   ├── Select (ordenação)
    │   ├── Botões de visualização (grid/compact/large)
    │   ├── Botão ocultos
    │   ├── Botão mod-compatible
    │   └── Botão "+ Adicionar"
    ├── Botão "Backup e Sincronizar"
    └── Botão "Sincronizar Steam"
```

---

## 2. TopBar

### Props

```typescript
interface Props {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  showHiddenGames: boolean;
  onToggleHidden: () => void;
  hasHiddenGames: boolean;
  showModCompatible: boolean;
  onToggleModCompatible: () => void;
  onAddGame: () => void;
  onBackupClick: () => Promise<void>;
  handleSyncSteam: () => Promise<void>;
  syncing: boolean;
  syncLabel: string;
}
```

### Renderização

```
┌─────────────────────────────────────────────────────────────────────┐
│ Meus Jogos │ [Toolbar: busca | sort | view | ocultos | mods | +] │ ☁ Backup │ ↻ Sync │
└─────────────────────────────────────────────────────────────────────┘
   56px height, flex, space-between
```

### Layout

```
.games__topbar
├── .games__topbar-left (flex: 1)
│   ├── h1.games__title ("Meus Jogos")
│   ├── .games__divider (1px vertical)
│   └── GamesToolbar (flex: 1)
├── button.games__backup-btn ("☁ Backup e Sincronizar")
└── button.games__sync-btn ("↻ {syncLabel}")
```

---

## 3. GamesToolbar

### Props

```typescript
interface GamesToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  showHiddenGames: boolean;
  onToggleHidden: () => void;
  hasHiddenGames: boolean;
  onAddGame: () => void;
  showModCompatible?: boolean;
  onToggleModCompatible?: () => void;
}
```

### Renderização

```
┌──────────────────────────────────────────────────────────────┐
│ [🔍 Buscar jogos...] │ A-Z ▾ │ ▦ ☰ ⊞ │ 🙈/👁 │ 🎮 │ + Adicionar │
└──────────────────────────────────────────────────────────────┘
```

### Controles

| Controle | Tipo | Valor | Ação |
|----------|------|-------|------|
| Busca | TextField | `searchQuery` | Filtra jogos por título |
| Ordenação | Select | `sortBy` | A-Z, Z-A, Recentes, Mais jogados, Instalados |
| Visualização | Buttons | `viewMode` | Grid, Compact, Large |
| Ocultos | Button | `showHiddenGames` | Alterna mostrar/ocultar jogos ocultos |
| Mod Compatible | Button | `showModCompatible` | Filtra jogos compatíveis com mods |
| Adicionar | Button | — | Abre modal de adição |

### Lógica de Filtragem

```
showModCompatible?
├── true → Mostra apenas jogos com mods habilitados
└── false → Mostra todos os jogos

showHiddenGames?
├── true → Mostra jogos ocultos
└── false → Oculta jogos ocultos
```

---

## 4. SCSS

### Estrutura de Espaçamento

```scss
.games__topbar {
  height: 56px;
  padding: 0 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.games__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
```

### Cores

```scss
// Fundo
--bg-toolbar: transparent
--bg-select: rgba(0, 0, 0, 0.25)
--bg-button: transparent
--bg-button-hover: rgba(255, 255, 255, 0.06)
--bg-button-active: rgba(255, 255, 255, 0.1)
--bg-add-hover: var(--accent-gradient)

// Texto
--text-title: rgba(255, 255, 255, 0.85)
--text-button: rgba(255, 255, 255, 0.4)
--text-button-hover: rgba(255, 255, 255, 0.7)
--text-button-active: #fff

// Bordas
--border-toolbar: rgba(255, 255, 255, 0.08)
--border-select: rgba(255, 255, 255, 0.08)
```

### Dimensões

```scss
.games__topbar { height: 56px; }
.games__toolbar .TextField { height: 30px; min-width: 140px; max-width: 200px; }
.games__toolbar-select { height: 30px; }
.games__toolbar-add { height: 30px; }
```

---

## 5. Problemas Identificados

### 🔴 CRÍTICOS

#### 5.1 `GamesTopBar` tem 15 props — Interface gigante

```typescript
interface Props {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  showHiddenGames: boolean;
  onToggleHidden: () => void;
  hasHiddenGames: boolean;
  showModCompatible: boolean;
  onToggleModCompatible: () => void;
  onAddGame: () => void;
  onBackupClick: () => Promise<void>;
  handleSyncSteam: () => Promise<void>;
  syncing: boolean;
  syncLabel: string;
}
```

**Problema:** 15 props é muita coisa. Isso viola o Princípio de Responsabilidade Única — o componente está fazendo demais.

**Impacto:** Difícil de manter, testar e reutilizar.

**Solução:** Agrupar props em objetos:
```typescript
interface TopBarProps {
  toolbar: ToolbarProps;
  actions: {
    onBackup: () => Promise<void>;
    onSync: () => Promise<void>;
    syncing: boolean;
    syncLabel: string;
  };
}
```

---

#### 5.2 `onBackupClick` é `Promise<void>` mas não trata erros

```typescript
<button className="games__backup-btn" onClick={onBackupClick}>
```

**Problema:** Se `onBackupClick` lançar uma exceção, o erro não é tratado. O botão não mostra estado de loading.

**Impacto:** Usuário não sabe se o backup está em andamento.

**Solução:** Adicionar estado de loading:
```typescript
const [backupLoading, setBackupLoading] = useState(false);
const handleBackup = async () => {
  setBackupLoading(true);
  try { await onBackupClick(); }
  finally { setBackupLoading(false); }
};
```

---

### 🟡 MÉDIOS

#### 5.3 `GamesToolbar` não tem `useCallback` para callbacks

```typescript
export function GamesToolbar({
  searchQuery, onSearchChange, viewMode, onViewModeChange,
  sortBy, onSortChange, showHiddenGames, onToggleHidden, hasHiddenGames,
  onAddGame, showModCompatible, onToggleModCompatible,
}: GamesToolbarProps) {
```

**Problema:** O componente não usa `useCallback` ou `memo`. Cada re-render do pai re-renderiza o toolbar inteiro.

**Impacto:** Performance ruim se o pai re-renderiza frequentemente.

**Solução:** Usar `React.memo` ou `useCallback` para callbacks.

---

#### 5.4 `SortOption` usa `as SortOption` cast inseguro

```typescript
<select value={sortBy} onChange={(e) => onSortChange(e.target.value as SortOption)}>
```

**Problema:** `as SortOption` é um cast que esconde valores inválidos. Se o select tiver um valor não mapeado, o TypeScript não avisa.

**Impacto:** Bug silencioso se novos valores forem adicionados.

**Solução:** Validar:
```typescript
const validSortOptions: SortOption[] = ["title_asc", "title_desc", ...];
const value = e.target.value as string;
if (validSortOptions.includes(value as SortOption)) {
  onSortChange(value as SortOption);
}
```

---

#### 5.5 `hasHiddenGames` pode ser `undefined`

```typescript
interface GamesToolbarProps {
  hasHiddenGames: boolean;  // ← required
}
```

Mas no `TopBar`:
```typescript
interface Props {
  hasHiddenGames: boolean;  // ← required
}
```

**Problema:** Ambos são `boolean` required, mas se o pai passar `undefined`, o TypeScript não avisa em runtime.

**Impacto:** Bug se `hasHiddenGames` for `undefined`.

---

#### 5.6 `ViewMode` e `SortOption` são importados de `types.ts` mas definidos em `games-types.ts`

```typescript
// TopBar.tsx
import type { ViewMode, SortOption } from "../../types";

// types.ts
import { ViewMode, SortOption } from "@games-ui/pages/games/games-types";
```

**Problema:** Tipos são re-exportados de um local longo. Isso cria dependência circular potencial.

**Impacto:** Difícil de rastrear de onde vêm os tipos.

---

### 🟢 MENORES

#### 5.7 Botões de visualização usam Unicode em vez de ícones

```typescript
<button title="Cards (padrão)">▦</button>
<button title="Compacto">☰</button>
<button title="Grande (detalhado)">⊞</button>
```

**Problema:** Unicode pode renderizar diferente em Sistemas Operacionais diferentes.

**Impacto:** Inconsistência visual entre Sistemas Operacionais.

---

#### 5.8 Botão de ocultos tem dois emojis diferentes

```typescript
{showHiddenGames ? "🙈" : "👁"}
```

**Problema:** 🙈 e 👁 são emojis que podem não renderizar em todos os Sistemas Operacionais.

**Impacto:** Botão pode aparecer como quadrado em Sistemas Operacionais antigos.

---

#### 5.9 `games__backup-btn` não tem ícone SVG

```typescript
<button className="games__backup-btn" onClick={onBackupClick}>
  <span className="games__backup-icon">☁</span>Backup e Sincronizar
</button>
```

**Problema:** Usa Unicode ☁ em vez de ícone SVG consistente.

---

#### 5.10 `games__sync-btn` não mostra estado de loading

```typescript
<button className="games__sync-btn" onClick={handleSyncSteam} disabled={syncing}>
  <span className={`games__sync-icon ${syncing ? "games__sync-icon--spin" : ""}`}>↻</span>
  {syncLabel}
</button>
```

**Problema:** O botão é desabilitado quando `syncing=true`, mas não mostra indicador visual de progresso (além do spin no ícone).

**Impacto:** Usuário pode não perceber que algo está acontecendo.

---

## 6. Recomendações

### Prioridade Alta

1. **Reduzir props** do `GamesTopBar` — Agrupar em objetos
2. **Adicionar loading state** para botões de ação (backup, sync)
3. **Usar `React.memo`** ou `useCallback` no `GamesToolbar`

### Prioridade Média

4. **Validar `SortOption`** em vez de cast
5. **Usar ícones SVG** em vez de Unicode
6. **Adicionar indicador visual** de loading no sync

### Prioridade Baixa

7. **Simplificar imports de tipos** — Evitar re-exports longos
8. **Padronizar ícones** — Todos SVG ou todos Unicode
9. **Testar rendering** em diferentes Sistemas Operacionais

---

## Resumo

| Arquivo | Linhas | Props | Problemas |
|---------|--------|-------|-----------|
| `TopBar.tsx` | ~50 | 15 | Interface gigante |
| `Toolbar.tsx` | ~60 | 11 | Cast inseguro |
| `toolbar.scss` | ~130 | — | OK |
| **Total** | **~240** | **26** | **10 problemas** |

### Props Totais

| Componente | Props | Callbacks |
|------------|-------|-----------|
| `GamesTopBar` | 15 | 10 |
| `GamesToolbar` | 11 | 7 |
| **Total** | **26** | **17** |

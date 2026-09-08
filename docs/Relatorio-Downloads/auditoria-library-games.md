# Auditoria — Abas Library e Games

> **Data:** 18/08/2026  
> **Objetivo:** Mapear a estrutura, identificar problemas e documentar as abas Library e Games.

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Aba Library (`app/Library/`)](#2-aba-library)
3. [Aba Games (`app/Games/`)](#3-aba-games)
4. [AddGame (`app/Games/AddGame/`)](#4-addgame)
5. [Problemas Identificados](#5-problemas-identificados)
6. [Recomendações](#6-recomendações)

---

## 1. Visão Geral

```
MAKAI FORGE
│
├── ABA LIBRARY (app/Library/)
│   ├── Biblioteca de jogos (grid/list)
│   ├── Ordenação: título, recentemente jogado, mais jogado, instalados primeiro
│   ├── Coleções: favoritos + coleções customizadas
│   ├── 3 modos de visualização: grid, compact, large
│   └── Context menu: detalhes, favoritar, coleção, deletar
│
├── ABA GAMES (app/Games/)
│   ├── Gerenciamento de jogos (mais complexo que Library)
│   ├── Seções: Steam, Steam (Biblioteca), Local
│   ├── GameBar: barra inferior com ações
│   ├── Modais: add, config, delete, backup, dll-check
│   └── Wine Tools: winetricks, taskmgr, control, regedit, etc.
│
└── ADD GAME (app/Games/AddGame/)
    ├── Modal para adicionar jogo custom
    ├── Seleção de runner (proton/wine/steam)
    ├── Auto-detect de Protons instalados
    └── Download de capas do Steam
```

---

## 2. aba Library (`app/Library/`)

### 2.1 Estrutura de Arquivos

| Arquivo | Função | Linhas |
|---------|--------|--------|
| `library.tsx` | Componente principal | ~700 |
| `library-game-card.tsx` | Card compacto | ~120 |
| `library-game-card-large.tsx` | Card grande | ~180 |
| `filter-options.tsx` | Opções de ordenação | ~60 |
| `view-options.tsx` | Modos de visualização | ~50 |

### 2.2 Funcionalidades

**Ordenação:**
- `title_asc` — Título A-Z
- `title_desc` — Título Z-A
- `recently_played` — Última vez jogado
- `most_played` — Mais horas jogadas
- `installed_first` — Instalados primeiro

**Coleções:**
- Favoritos (Built-in)
- Coleções customizadas (via API)
- Filtragem por coleção
- Renomear/deletar coleções

**Visualização:**
- `grid` — Cards grandes
- `compact` — Cards pequenos
- `large` — Lista com hero image

**Context Menu:**
- Detalhes do jogo
- Favoritar
- Adicionar/remover de coleção
- Deletar

### 2.3 Hooks Usados

- `useLibrary()` — dados da biblioteca
- `useGameCollections()` — coleções
- `useToast()` — notificações
- `useGameCard()` — lógica do card

---

## 3. Aba Games (`app/Games/`)

### 3.1 Estrutura de Arquivos

| Arquivo | Função |
|---------|--------|
| `index.tsx` | Componente principal |
| `types.ts` | Tipos (GamesPageState) |
| `hooks/useGamesPage.ts` | Orquestrador principal |
| `hooks/useGameUIState.ts` | Estado da UI |
| `hooks/useSteamState.ts` | Estado da Steam |
| `hooks/useGamesDerivedData.ts` | Dados derivados |
| `hooks/useGameEffects.ts` | Efeitos colaterais |
| `components/gamebar/GameBar.tsx` | Barra inferior |
| `components/sections/SteamSection.tsx` | Seção Steam |
| `components/sections/LocalSection.tsx` | Seção Local |
| `components/toolbar/TopBar.tsx` | Barra superior |
| `components/modals/` | Modais |
| `utils/games-utils.ts` | Utilitários |
| `utils/saveGameConfig.ts` | Salvar config |

### 3.2 Funcionalidades

**Seções:**
- **Steam** — Jogos detectados da Steam
- **Steam (Biblioteca)** — Jogos Steam na biblioteca
- **Local** — Jogos adicionados manualmente

**GameBar (Barra Inferior):**
- ▶️ Play / Stop
- ⚙️ Configurar
- 🔧 Wine Tools (winetricks, taskmgr, control, regedit, winecfg, wineconsole, terminal, runexe, winelog)
- 📁 Abrir pasta
- 🍷 Abrir prefixo
- 🗑️ Deletar
- 📋 Duplicar
- 🔗 Criar atalho Steam
- 👁️ Ocultar
- ⭐ Favoritar
- 🔄 Sincronizar Steam
- 📥 Adicionar à Steam
- 🧹 Limpar prefixo

**Modais:**
- Add Game — Adicionar jogo custom
- Config Game — 10+ abas de configuração
- Delete Game — Deletar jogo
- Backup — Backup/restore
- DLL Check — Verificar DLLs

### 3.3 Hook Principal: `useGamesPage`

```
useGamesPage()
│
├── useGameUIState() — estado da UI
│   ├── searchQuery, viewMode, sortBy
│   ├── showAddModal, showConfigModal, showDeleteModal
│   ├── showBackupModal, showBackupPanel
│   ├── dllCheckModal
│   └── gameContextMenu
│
├── useGames() — dados dos jogos
│   ├── filteredGames, loading, loadGames
│   ├── selectedGame, setSelectedGame
│   ├── playGame, stopGame, hideGame, favoriteGame
│   ├── deleteGame, deleteGameWithPrefix
│   ├── duplicateGame, addToSteam, createShortcut
│   ├── revealFolder, revealWinePrefix
│   └── runWineTool
│
├── useSteamState() — estado da Steam
│   ├── steamGames, syncing
│   ├── selectedSteamGame
│   ├── handleSyncSteam, handlePlaySteam
│   ├── handleFavoriteSteam
│   └── handleClearSteamPrefix
│
├── useGamesDerivedData() — dados derivados
│   ├── filteredSteam, localGames, librarySteamGames
│   ├── hasSteamGames, hasLocalGames, hasLibrarySteamGames
│   ├── showEmpty, showNoSearchResults, showLoading
│   ├── activeGame, isSteamActive, isRunning
│   └── syncLabel
│
└── useGameEffects() — efeitos colaterais
```

---

## 4. AddGame (`app/Games/AddGame/`)

### 4.1 Estrutura de Arquivos

| Arquivo | Função |
|---------|--------|
| `add-game-modal.tsx` | Modal de adição de jogo |
| `games-service.ts` | Serviço CRUD de jogos |
| `add-custom-game-to-library.ts` | Handler IPC |
| `add-game-modal.scss` | Estilos |

### 4.2 `GameConfig` Interface (77 campos!)

```typescript
interface GameConfig {
  objectId: string;
  shop: string;
  title: string;
  slug: string;
  runner: "proton" | "wine" | "steam";
  isDeleted: boolean;
  favorite: boolean;
  executablePath?: string;
  prefix?: string;
  coverImageUrl?: string;
  iconUrl?: string;
  logoImageUrl?: string;
  libraryImageUrl?: string;
  libraryHeroImageUrl?: string;
  playTimeInMilliseconds: number;
  lastTimePlayed: string | null;
  protonVersion?: string;
  protonPath?: string;
  wineVersion?: string;
  winePrefixPath?: string;
  launchOptions?: string;
  gameArgs?: string;
  prelaunchCommand?: string;
  postexitCommand?: string;
  env?: Record<string, string>;
  mangoHud?: boolean;
  autoRunMangohud?: boolean;
  gameMode?: boolean;
  autoRunGamemode?: boolean;
  dxvk?: boolean;
  esync?: boolean;
  fsync?: boolean;
  protonAddons?: string[];
  containerCommand?: string;
  resolution?: string;
  fpsLimit?: string;
  vsync?: string;
  renderingMode?: string;
  videoDriver?: string;
  dxvkVersion?: string;
  vulkan?: boolean;
  frameThrottle?: string;
  audioDriver?: string;
  audioChannels?: string;
  audioSampleRate?: string;
  audioInBackground?: boolean;
  threadedD3D?: boolean;
  preferSystemLibs?: boolean;
  dllOverrides?: string;
  dlls?: string[];
  winetricks?: string;
  language?: string;
  locale?: string;
  vkd3d?: boolean;
  textures?: boolean;
  dxvkAsync?: boolean;
  amdFsr?: boolean;
  amdFsrSharpness?: string;
  fluidResolution?: boolean;
  superResolution?: boolean;
  esyncManual?: boolean;
  fsyncManual?: boolean;
  enableEac?: boolean;
  enableBattlEye?: boolean;
  vkd3dVersion?: string;
  d3dExtras?: boolean;
  d3dExtrasVersion?: string;
  virtualDesktop?: boolean;
  wineDesktop?: string;
  dpiScaling?: boolean;
  explicitDpi?: string;
  mouseWarpOverride?: string;
  graphicsBackend?: string;
  installedSizeInBytes?: number | null;
  installerSizeInBytes?: number | null;
}
```

### 4.3 Fluxo de Adição

```
usuário clica "Add Game"
│
├── AddGameModal aberto
│   ├── Preenche: nome, executável, prefix, runner, proton version
│   └── Busca capa do Steam automaticamente
│
├── handleSubmit()
│   ├── searchGameCover(name) → busca capa
│   ├── Cria objeto GameConfig
│   └── gamesService.save(game)
│       └── window.electron.addCustomGameToLibrary(...)
│
└── add-custom-game-to-library.ts
    ├── Gera objectId (UUID)
    ├── Verifica títulos duplicados
    ├── Baixa capas do Steam (se steamAppId)
    ├── Cria assets no gamesShopAssetsStore
    ├── Cria diretório do prefixo
    ├── Salva no gamesStore
    └── Salva JSON em userData/games/{objectId}.json
```

---

## 5. Problemas Identificados

### 🔴 CRÍTICOS

#### 5.1 `GameConfig` duplicado com `LibraryGame`

**Problema:** Existem DUAS interfaces para jogos:
- `GameConfig` (77 campos) em `app/Games/AddGame/games-service.ts`
- `LibraryGame` em `src/types/`

São interfaces similares mas com campos diferentes. Isso causa:
- Confusão sobre qual usar
- casting `as unknown as GameConfig` no código
- Bugs silenciosos quando campos não batem

**Evidência:**
```typescript
// games-service.ts
const library = await window.electron.getLibrary();
const games = library as unknown as GameConfig[];  // ← CAST PERIGOSO
```

---

#### 5.2 `update()` envia 70+ campos

**Problema:** O `gamesService.update()` envia TODOS os 77 campos do `GameConfig` para o IPC, mesmo os que não mudaram:

```typescript
await window.electron.updateGameConfig(game.shop, game.objectId, {
  title: game.title,
  executablePath: game.executablePath || '',
  runner: game.runner,
  prefix: game.winePrefixPath || game.prefix,
  winePrefixPath: game.winePrefixPath || game.prefix,
  // ... 65+ mais campos
});
```

**Impacto:** Performance ruim, payloads enormes, risco de sobrescrever campos com valores padrão.

---

### 🟡 MÉDIOS

#### 5.3 `handleNameChange` busca prefix async mas não espera

```typescript
const handleNameChange = async (newName: string) => {
  setName(newName);
  const sanitized = newName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const homePath = await window.electron.getUserHomePath();  // ← async
  const defaultPrefix = `${homePath}/Games/Makai-forger/${sanitized}`;
  setPrefix(defaultPrefix);  // ← pode rodar antes do await
};
```

**Problema:** Se o usuário digitar rápido, múltiplas chamadas async podem competir e o prefix pode ficar com valor antigo.

---

#### 5.4 `addCustomGameToLibrary` busca duplicatas ineficientemente

```typescript
const existingGames = await gamesStore.iterator().all();
let finalTitle = title;
let counter = 1;

while (existingGames.some(([_, game]) => game.title === finalTitle)) {
  counter++;
  finalTitle = `${title} (Copy ${counter - 1})`;
}
```

**Problema:** `iterator().all()` carrega TODOS os jogos na memória só para verificar duplicatas. Para bibliotecas grandes, isso é ineficiente.

---

#### 5.5 `console.log` em produção

```typescript
// add-game-modal.tsx
console.log("Loaded protons:", protons);
console.log("Cover search result:", coverResult);
console.log("Saving game:", game);

// games-service.ts
console.log("Adding game to Library:", game.title);
console.log("Game added to Library:", game.title);
console.log("Updating game config:", game.title);
console.log("Game config updated:", game.title);
```

**Problema:** Logs de debug em produção poluem o console e podem vazar informações sensíveis.

---

#### 5.6 `Library` não tem `useCallback` memoizado para `handleOnMouseEnterGameCard`

```typescript
const handleOnMouseEnterGameCard = useCallback(() => {
  // Optional: pause animations if needed
}, []);

const handleOnMouseLeaveGameCard = useCallback(() => {
  // Optional: resume animations if needed
}, []);
```

**Problema:** Funções vazias criadas com `useCallback` — desnecessário, poderiam ser removed ou implementadas.

---

#### 5.7 `GameBar` não verifica `selectedSteamGame` antes de usar `!`

```typescript
onPlay={() => isSteam ? onPlaySteam(selectedSteamGame!) : onPlayLocal(game)}
```

**Problema:** Usando `!` (non-null assertion) sem garantir que `selectedSteamGame` não é null. Se `isSteam` for true mas `selectedSteamGame` for null, crasha.

---

### 🟢 MENORES

#### 5.8 `filter-options.tsx` usa `event.target.value` sem type assertion

```typescript
onChange={(event) => onSortChange(event.target.value as SortOption)}
```

**Problema:** `as SortOption` é um cast que pode esconder valores inválidos.

---

#### 5.9 `view-options.tsx` não salva preferência no localStorage

Diferente de `library.tsx` que salva `viewMode` e `sortBy` no localStorage, o Games tab não persiste essas preferências.

---

#### 5.10 `LibraryGameCardLarge` usa `heroSources[heroIndex]` sem bounds check

```typescript
const backgroundStyle = useMemo(() => {
  const url = heroSources[heroIndex];
  return url ? { backgroundImage: `url("${normalizePathForCss(url)}")` } : {};
}, [heroIndex, heroSources]);
```

**Problema:** Se `heroIndex` for maior que `heroSources.length`, `url` será `undefined`. O check `url ?` previne crash, mas o estado fica inconsistente.

---

## 6. Recomendações

### Prioridade Alta

1. **Unificar `GameConfig` e `LibraryGame`** — Criar um único tipo compartilhado
2. **Remover `console.log`** em produção — Usar `logger` do shared
3. **Otimizar `update()`** — Enviar apenas campos que mudaram (diff)

### Prioridade Média

4. **Adicionar debounce** em `handleNameChange`
5. **Otimizar verificação de duplicatas** — Usar query em vez de carregar tudo
6. **Corrigir non-null assertions** no GameBar
7. **Persistir preferências** do Games tab no localStorage

### Prioridade Baixa

8. **Remover funções vazias** ou implementá-las
9. **Adicionar types mais seguros** para SelectField
10. **Documentar a separação** Library vs Games

---

## Resumo

| Aba | Arquivos | Linhas | Status |
|-----|----------|--------|--------|
| Library | 5 | ~1100 | ✅ Boa estrutura |
| Games | 15+ | ~3000 | ⚠️ Complexa, muitos hooks |
| AddGame | 4 | ~700 | ⚠️ GameConfig muito grande |
| **Total** | **24+** | **~4800** | |

### Principais Issues

1. **GameConfig duplicado** (77 campos) vs LibraryGame
2. **console.log em produção**
3. **update() envia 70+ campos**
4. **Non-null assertions perigosas**
5. **Performance: iterator().all() para duplicatas**

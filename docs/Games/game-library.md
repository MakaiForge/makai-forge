# Game Library Management

> Gerencia a biblioteca de jogos do usuário: 64+ handlers IPC, armazenamento, coleções,
> favoritos, pins, playtime, transferência de arquivos e sync com servidor.

---

## Mapa Mental

```
LIBRARY SYSTEM
│
├── DADOS (armazenamento)
│     ├── gamesSublevel       → Game { shop, objectId, title, playtime, config... }
│     ├── gamesShopAssetsSublevel → ShopAssets { iconUrl, heroUrl, screenshots... }
│     └── downloadsSublevel   → Download { status, progress, uri... }
│
├── IPC HANDLERS (64+)
│     ├── CRUD: add, remove, getLibrary, getGameByObjectId
│     ├── Favoritos/Pins: add/removeFavorite, togglePin
│     ├── Playtime: changeGamePlayTime
│     ├── Coleções: assignGameToCollection
│     ├── Launch: openGame, closeGame, getLaunchProtonVersion
│     ├── Instalação: openGameInstaller, installAndScan, scanInstalledGames
│     ├── Config: updateGameConfig, updateLaunchOptions, selectProtonPath
│     ├── Delete: deleteWithPrefix, deleteFolder, deletePrefix, deleteArchive
│     ├── Shortcuts: createGameShortcut, createSteamShortcut (e delete/check)
│     ├── Transfer: transferGameFiles, cancelGameTransfer
│     └── Utils: getDiskFreeSpace, isGamemodeAvailable, verifyExecutablePath
│
├── RENDERER
│     ├── Library Page (library.tsx)
│     │     ├── FilterOptions (sort: title/recent/most/installed)
│     │     ├── ViewOptions (compact/grid/large)
│     │     ├── Collections Bar (favoritos + coleções dinâmicas)
│     │     ├── LibraryGameCard (compact/grid)
│     │     └── LibraryGameCardLarge (hero + logo + size bars)
│     │
│     └── Redux Slices
│           ├── library-slice (value[], searchQuery)
│           └── collections-slice (items[], isLoading)
│
└── SYNC SERVICE (stubs)
      ├── createGame (stub)
      ├── trackGamePlaytime (stub)
      ├── mergeWithRemoteGames (stub)
      └── clearGamesRemoteIds (funcional)
```

---

## Armazenamento

```typescript
// Game — objeto principal no gamesSublevel
interface Game {
  title: string
  iconUrl: string | null
  libraryHeroImageUrl: string | null
  logoImageUrl: string | null
  customIconUrl?: string | null
  customLogoImageUrl?: string | null
  customHeroImageUrl?: string | null
  originalIconPath?: string | null       // custom games apenas
  originalLogoPath?: string | null
  originalHeroPath?: string | null
  playTimeInMilliseconds: number
  unsyncedDeltaPlayTimeInMilliseconds?: number
  lastTimePlayed: Date | null
  objectId: string
  shop: GameShop
  remoteId: string | null
  collectionIds?: string[]
  isDeleted: boolean                     // soft delete
  winePrefixPath?: string | null
  protonPath?: string | null
  protonVersion?: string | null
  executablePath?: string | null
  launchOptions?: string | null
  enableEac?: boolean | null
  enableBattlEye?: boolean | null
  autoRunMangohud?: boolean | null
  autoRunGamemode?: boolean | null
  favorite?: boolean
  isPinned?: boolean
  pinnedDate?: Date | null
  automaticCloudSync?: boolean
  hasManuallyUpdatedPlaytime?: boolean
  newDownloadOptionsCount?: number
  installedSizeInBytes?: number | null
  installerSizeInBytes?: number | null
  steamShortcutAppId?: number
  dxvk?: boolean | null
  esync?: boolean | null
  fsync?: boolean | null
  dxvkVersion?: string | null
  dxvkAsync?: boolean | null
  env?: Record<string, string>
}

// LibraryGame — usado no runtime (Game + ShopAssets + Download)
type LibraryGame = Game & Partial<ShopAssets> & {
  id: string
  download: Download | null
}
```

---

## Tabela IPC Completa

### Invoke (Renderer → Main)

| Canal | Uso |
|-------|-----|
| `addGameToLibrary` | Adicionar jogo à biblioteca (soft undelete) |
| `addCustomGameToLibrary` | Adicionar jogo custom/sideloaded |
| `removeGameFromLibrary` | Soft delete (keep prefix/folder) |
| `deleteGameCompletely` | Hard delete do DB |
| `deleteGameWithPrefix` | Delete prefixo + DB |
| `deleteGameFolder` | Deletar pasta do instalador |
| `deleteGamePrefix` | Deletar prefixo Wine |
| `deleteArchive` | Deletar arquivo de instalação |
| `getLibrary` | Listar todos os jogos |
| `getGameByObjectId` | Buscar jogo específico |
| `addGameToFavorites` | Favoritar |
| `removeGameFromFavorites` | Desfavoritar |
| `toggleGamePin` | Pin/unpin + pinnedDate |
| `changeGamePlayTime` | Alterar playtime manualmente |
| `assignGameToCollection` | Atribuir a coleções |
| `openGame` | Iniciar jogo |
| `closeGame` | Fechar jogo (matar processo) |
| `openGameInstaller` | Abrir instalador |
| `installAndScan` | Instalar + escanear prefixo |
| `scanInstalledGames` | Escanear jogos instalados |
| `setGameExecutablePath` | Selecionar .exe |
| `saveInstalledGameExecutable` | Salvar .exe pós-instalação |
| `updateExecutablePath` | Atualizar path do executável |
| `updateGameConfig` | Atualizar config (bulk) |
| `updateLaunchOptions` | Atualizar launch options |
| `updateCustomGame` | Atualizar metadados de jogo custom |
| `updateGameCustomAssets` | Atualizar assets de jogo Steam |
| `selectGameProtonPath` | Selecionar Proton path |
| `selectGameWinePrefix` | Selecionar Wine prefix |
| `getInstalledProtonVersions` | Listar Protons instalados |
| `getGameLaunchProtonVersion` | Resolver Proton efetivo |
| `getGameInstallerActionType` | "install" vs "open-folder" |
| `getGameSaveFolder` | Pasta de save via Ludusavi |
| `getAvailableDrives` | Listar drives/disponíveis |
| `getDefaultWinePrefixSelectionPath` | Path padrão do prefixo |
| `installGameExe` | Instalar via folder |
| `toggleGameMangohud` | Toggle MangoHud |
| `toggleGameGamemode` | Toggle GameMode |
| `toggleAutomaticCloudSync` | Toggle cloud sync |
| `createGameShortcut` | Atalho .desktop |
| `createSteamShortcut` | Atalho Steam |
| `deleteSteamShortcut` | Remover atalho Steam |
| `checkSteamShortcut` | Verificar atalho Steam |
| `copyCustomGameAsset` | Copiar + redimensionar asset |
| `cleanupUnusedAssets` | Limpar assets órfãos |
| `clearNewDownloadOptions` | Limpar badge de novos downloads |
| `downloadGameCovers` | Baixar capas Steam |
| `refreshLibraryAssets` | Trigger sync remoto |
| `transferGameFiles` | Transferir jogo para outro drive |
| `cancelGameTransfer` | Cancelar transferência |
| `isGamemodeAvailable` | Verificar gamemode instalado |
| `isMangohudAvailable` | Verificar MangoHud instalado |
| `isWinetricksAvailable` | Verificar winetricks instalado |
| `verifyExecutablePathInUse` | Verificar se .exe já usado |
| `resetGameAchievements` | Resetar achievements (stub) |
| `openExeFilePicker` | File picker nativo |
| `openGameInstallerPath` | Abrir pasta do instalador |
| `openGameExecutablePath` | Abrir pasta do executável |
| `openGameWinePrefix` | Abrir prefixo Wine |
| `openGameWinetricks` | Abrir winetricks GUI |
| `openGameSaveFolder` | Abrir pasta de save |
| `runWineTool` | Executar ferramenta Wine |
| `removeGame` | Deletar entrada de download |

### Push (Main → Renderer)

| Evento | Payload | Quando |
|--------|---------|--------|
| `on-games-running` | `GameRunning[]` | A cada 2s (process watcher) |
| `on-library-batch-complete` | `void` | Sync remoto concluído |
| `on-extraction-complete` | `(shop, objectId)` | Extração concluída |
| `on-extraction-progress` | `(shop, objectId, progress)` | Progresso da extração |
| `on-extraction-failed` | `(shop, objectId)` | Extração falhou |
| `on-game-transfer-progress` | `{speed, eta, transferred, total}` | Progresso de transferência |
| `on-game-transfer-complete` | `(shop, objectId, newExePath)` | Transferência concluída |
| `on-game-transfer-error` | `(shop, objectId, error)` | Erro na transferência |
| `on-game-transfer-cancelled` | `(shop, objectId)` | Transferência cancelada |

---

## Página da Biblioteca

```
/library → library.tsx
  ├── URL: ?collection=<id> | ?query=<search>
  ├── useLibrary() + useGameCollections()
  │
  ├── FilterOptions (sort: title_asc, title_desc, recently_played, most_played, installed_first)
  ├── ViewOptions (compact | grid | large)
  ├── Collections Bar (favorites + coleções dinâmicas via API)
  │
  ├── Favorites Collection → __favorites__ (virtual, filtra game.favorite === true)
  ├── Coleções reais → vêm de GET /profile/games/collections
  │
  ├── LibraryGameCard (compact/grid — fallback de imagem: customIcon > cover > library > icon)
  └── LibraryGameCardLarge (hero — com logo, size bars de instalação)
```

### View Modes
| Mode | Descrição |
|------|-----------|
| `compact` | Grid pequeno |
| `grid` | Grid médio |
| `large` | Cards hero com background + logo |

### Sort Options
| Valor | Critério | Tiebreaker |
|-------|----------|------------|
| `title_asc` | Título A-Z | — |
| `title_desc` | Título Z-A | — |
| `recently_played` | lastTimePlayed ↓ | Título A-Z |
| `most_played` | playTimeInMilliseconds ↓ | Título A-Z |
| `installed_first` | has executablePath ↓ | Título A-Z |

---

## Coleções

Arquitetura **server-side** (REST API):

```
GET    /profile/games/collections        → listar
POST   /profile/games/collections        → criar { name }
PUT    /profile/games/collections/:id    → renomear
DELETE /profile/games/collections/:id    → deletar
```

Atribuição: `assignGameToCollection(shop, objectId, collectionIds[])` escreve `collectionIds[]` no armazenamento local.

Erros: `game/collection-name-already-in-use`, `game/collection-name-required`, `game/collection-limit-reached`

---

## Fluxo de Adição/Remoção

### Adicionar jogo
```
addGameToLibrary(shop, objectId, title)
  → Se já existe no armazenamento: isDeleted=false
  → Se novo: cria Game { playTimeInMilliseconds: 0, lastTimePlayed: null }
  → createGame() → STUB (no-op)
```

### Adicionar jogo custom
```
addCustomGameToLibrary(title, exePath, iconUrl?, logoUrl?, heroUrl?)
  → Gera objectId (UUID)
  → Deduplica título (adiciona "(Copy N)")
  → Extrai steamAppId das URLs se presente
  → Baixa capas Steam (header.jpg, profile.jpg)
  → Salva ShopAssets + Game no armazenamento
  → Cria winePrefixPath em ~/games/distrofrager/
```

### Remover jogo
```
removeGameFromLibrary(shop, objectId)
  → Soft delete: isDeleted=true, executablePath=null
  → Deleta assets locais que começam com "local:"
  → Para Steam games: reseta shop assets + custom images
```

---

## Transferência de Arquivos (Drive)

```
transferGameFiles(shop, objectId, destPath)
  → Engine estilo Steam: 8 streams paralelos
  → Progresso via on-game-transfer-progress
  → Cancelável via cancelGameTransfer()
  → Verifica espaço em disco antes
```

---

## Redux State

```typescript
// library-slice
interface LibraryState {
  value: LibraryGame[]        // lista completa
  searchQuery: string          // texto de busca
}

// collections-slice
interface CollectionsState {
  items: GameCollection[]      // ordenado por nome
  isLoading: boolean
  hasLoaded: boolean
}
```

---

## Arquivos Envolvidos

| Área | Caminho |
|------|---------|
| **Types** | `src/types/index.ts`, `src/types/level.types.ts`, `src/types/game.types.ts` |
| **Main IPC** | `src/main/events/library/` (59+ handlers) |
| **Main Sync** | `src/main/services/library-sync/` (stubs) |
| **Preload** | `src/preload/library.ts` |
| **Renderer Page** | `src/renderer/src/pages/library/` (library.tsx, cards, filters, views) |
| **Renderer Hooks** | `src/renderer/src/hooks/use-library.ts`, `use-game-collections.ts` |
| **Renderer Redux** | `src/renderer/src/features/library-slice.ts`, `collections-slice.ts` |
| **Renderer Components** | `src/renderer/src/components/create-collection-modal/` |

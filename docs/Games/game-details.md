# Game Details Page

> Página de detalhes de cada jogo: hero, galeria de mídia, repacks, modais de
> configuração, cloud sync, ProtonDB, requisitos e idiomas.

---

## Mapa Mental

```
GAME DETAILS (/game/:shop/:objectId)
│
├── GameDetailsContextProvider (busca dados)
├── CloudSyncContextProvider (backups)
│
├── HERO
│     ├── Background image (fallback chain: customHero > libraryHero > header)
│     ├── GameLogo (customLogo > assets.logoImageUrl)
│     └── HeroPanel
│           ├── Playtime + last played + download progress
│           └── Actions: Play, Favorite, Pin, Options
│
├── CONTEÚDO
│     ├── DescriptionHeader (release date, publisher, price)
│     ├── GallerySlider (Embla carousel: vídeos + screenshots)
│     │     └── VideoPlayer (HLS, MP4, WebM, autoplay configurável)
│     ├── "About the Game" (HTML, toggle show more)
│     └── Sidebar
│           ├── ProtonDBSection (tier, score, deck badge)
│           ├── Proton Recommended (versão + confiança)
│           ├── PC Requirements (min/recommended toggle)
│           └── GameLanguageSection (tabela de idiomas)
│
├── MODAIS
│     ├── RepacksModal → DownloadSettingsModal → startDownload()
│     │     ├── Filtro por texto + fonte
│     │     ├── Badges: recommended, new, debrid, last downloaded
│     │     └── Availability orb (online/partial/offline)
│     │
│     ├── GameOptionsModal (6 categorias)
│     │     ├── General (título, exe, transfer, shortcuts, launch options)
│     │     ├── Assets (icon/logo/hero picker + drag-and-drop)
│     │     ├── Compatibility (Proton, Wine prefix, GameMode, MangoHud)
│     │     ├── Downloads (repacks, download folder)
│     │     ├── Danger Zone (remove, playtime, delete files)
│     │     └── ProtonForge Cloud (cloud sync panel)
│     │
│     ├── CloudSyncPanel (backups: upload, list, install, freeze, delete, rename)
│     ├── CloudSyncFilesModal (file mapping auto/manual)
│     ├── ChangeGamePlaytimeModal
│     ├── RemoveFromLibraryModal
│     └── CreateSteamShortcutModal
```

---

## Estrutura da Página

```
game-details/
├── game-details.tsx                    ← Entry point + contexts
├── game-details-content.tsx            ← Layout principal
├── game-details-skeleton.tsx           ← Loading skeleton
│
├── hero/
│   ├── hero-panel.tsx                  ← Playtime + action buttons
│   ├── hero-panel-actions.tsx          ← Play, Download, Fav, Pin, Options
│   └── hero-panel-playtime.tsx         ← Playtime display
│
├── gallery-slider/
│   ├── gallery-slider.tsx              ← Embla carousel
│   └── video-player.tsx               ← HLS/video player
│
├── description-header/
│   └── description-header.tsx          ← Release date, publisher, price
│
├── sidebar/
│   ├── sidebar.tsx                     ← Sidebar container
│   ├── protondb-section.tsx            ← ProtonDB badge + deck
│   ├── game-language-section.tsx       ← Tabela idiomas
│   └── sidebar-section.tsx             ← Accordion wrapper
│
├── modals/
│   ├── repacks-modal.tsx               ← Lista de repacks disponíveis
│   ├── download-settings-modal.tsx     ← Config de download
│   ├── game-options-modal.tsx          ← Hub de configurações
│   ├── game-options-modal/             ← Sub-seções do modal
│   │   ├── general-section.tsx
│   │   ├── compatibility-section.tsx
│   │   ├── downloads-section.tsx
│   │   ├── danger-zone-section.tsx
│   │   └── protonforge-cloud-section.tsx
│   ├── game-assets-settings.tsx        ← Custom icon/logo/hero
│   ├── change-game-playtime-modal.tsx
│   ├── create-steam-shortcut-modal.tsx
│   ├── remove-from-library-modal.tsx
│   └── real-debrid-info-modal.scss
│
├── cloud-sync/
│   ├── cloud-sync-panel.tsx            ← Full cloud sync UI
│   ├── cloud-sync-files-modal/        ← File mapping
│   └── cloud-sync-rename-artifact-modal/ ← Renomear backup
```

---

## Fluxo de Dados

```
GameDetailsContextProvider
  ├── window.electron.getGameShopDetails(objectId, shop, lang)
  │     → ShopDetailsWithAssets | null
  ├── window.electron.getGameAssets(objectId, shop)
  │     → ShopAssets | null
  ├── window.electron.getGameByObjectId(shop, objectId)
  │     → LibraryGame | null (armazenamento)
  └── forgerApi.get('/games/{shop}/{objectId}/download-sources')
        → GameRepack[] (repacks disponíveis)

CloudSyncContextProvider
  ├── forgerApi.get('/profile/games/artifacts?objectId=...&shop=...')
  │     → GameArtifact[]
  └── window.electron.getGameBackupPreview(objectId, shop)
        → LudusaviBackup | null
```

---

## GameOptionsModal — Categorias

| Categoria | Componente | O que faz |
|-----------|-----------|-----------|
| `general` | GeneralSettingsSection | Título, executável, transferência, shortcuts, launch options |
| `assets` | GameAssetsSettings | Icon/logo/hero custom (file picker + drag-and-drop) |
| `compatibility` | CompatibilitySettingsSection | Wine prefix, Proton, GameMode, MangoHud |
| `downloads` | DownloadsSettingsSection | Abrir repacks, abrir pasta de download |
| `danger_zone` | DangerZoneSection | Remover da lib, alterar playtime, deletar arquivos |
| `protonforge_cloud` | ProtonForgeCloudSettingsSection | Cloud sync panel |

---

## GallerySlider (Mídia)

- **Engine:** Embla Carousel
- **Slides:** `shopDetails.movies` (vídeos) + `shopDetails.screenshots` (imagens)
- **Vídeos suportados:** HLS (`application/x-mpegURL`), DASH, MP4, WebM
- **Autoplay:** primeira mídia se `autoplayGameTrailers` ativado
- **Navegação:** setas + preview strip com thumbnails

---

## IPC Events Usados

### Busca de dados
| IPC | Retorno |
|-----|---------|
| `getGameShopDetails` | ShopDetailsWithAssets |
| `getGameAssets` | ShopAssets |
| `getGameByObjectId` | LibraryGame |
| `forgerApi.get('/games/*/download-sources')` | GameRepack[] |
| `forgerApi.get('/games/*/protondb')` | ProtonDBData |
| `getGameBackupPreview` | LudusaviBackup |
| `forgerApi.get('/profile/games/artifacts')` | GameArtifact[] |

### Ações
| IPC | Quando |
|-----|--------|
| `addGameToLibrary` | Botão Add |
| `addGameToFavorites` | Favoritar |
| `toggleGamePin` | Pin/unpin |
| `openGame` | Jogar |
| `closeGame` | Fechar jogo |
| `selectGameProtonPath` | Mudar Proton |
| `selectGameWinePrefix` | Mudar prefix |
| `toggleGameMangohud` | Toggle MangoHud |
| `toggleGameGamemode` | Toggle GameMode |
| `updateCustomGame` | Editar metadados |
| `changeGamePlayTime` | Alterar playtime |
| `createSteamShortcut` | Criar atalho Steam |
| `transferGameFiles` | Transferir drive |

### Eventos escutados
| Evento | Efeito |
|--------|--------|
| `on-games-running` | Atualiza estado "jogando agora" |
| `on-game-transfer-progress` | Barra de progresso |
| `on-game-transfer-complete` | Refresh |
| `on-game-transfer-error` | Toast erro |
| `on-library-batch-complete` | Refresh |
| `onUploadComplete` | Refresh artifacts |
| `onBackupDownloadComplete` | Refresh artifacts |
| `onBackupDownloadProgress` | Barra de download |

---

## Arquivos Envolvidos

| Área | Caminho |
|------|---------|
| **Types** | `src/types/index.ts` (UserGameDetails, ShopDetails, ShopAssets) |
| **Renderer Page** | `src/renderer/src/pages/game-details/` (15+ subdirs, 40+ arquivos) |
| **Renderer Context** | Context providers inline no game-details.tsx |
| **IPC Events** | library/, catalogue/, cloud-save/ handlers |

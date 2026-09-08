# Context Providers

4 React context providers in `app/_shared/context/`. All exported from `context/index.ts`.

## GameDetailsContext
**File:** `game-details/game-details.context.tsx` + `game-details.context.types.ts`  
**Provider:** `GameDetailsProvider` (wraps game detail pages)  
**State managed:**
- `game: LibraryGame | null` — current game being viewed
- `shopDetails: ShopDetailsWithAssets | null` — full game metadata from the shop API
- `repacks: GameRepack[]` — available repack downloads for the game
- `isGameRunning: boolean` — whether the game process is active
- `isLoading: boolean` — initial data fetch status
- `showRepacksModal / showGameOptionsModal` — modal visibility flags
- `gameOptionsInitialCategory` — which tab to open in the options modal (`"general" | "locations" | "assets" | "protonforge_cloud" | "compatibility" | "downloads" | "danger_zone"`)
- `hasNSFWContentBlocked` — NSFW filter override
- `lastDownloadedOption: GameRepack | null` — most recently installed repack
- `isTransferring / transferProgress` — cloud transfer state
- **Methods:** `selectGameExecutable()`, `updateGame()`, `cancelTransfer()`, setters for modal/NSFW state

## SettingsContext
**File:** `settings/settings.context.tsx`  
**Provider:** `SettingsProvider` (wraps settings pages)  
**State managed:**
- `activeCategory: SettingsCategoryId` — currently active settings tab (`"general" | "login" | "account_settings" | "content_gameplay" | "runners" | "integrations" | "compatibility" | "account_privacy"`)
- `userPreferences: UserPreferences | null` — loaded from the key-value store, dispatched to Redux via `setUserPreferences`
- `userBlocks: UserBlocks | null` — content block list (NSFW, specific users)
- `isLoginModalVisible: boolean` — controls login modal display
- **Methods:** `setActiveCategory()`, `refreshUserPreferences()`, `refreshUserBlocks()`, `toggleBlockUser()`, setters for modal visibility
- **Router integration:** Reads `?category=` search param to auto-navigate to a specific tab; syncs active category to URL

## UserProfileContext
**File:** `user-profile/user-profile.context.tsx`  
**Provider:** `UserProfileProvider` (wraps user profile pages)  
**State managed:**
- `userProfile: UserProfile | null` — loaded profile data
- `isMe: boolean` — whether viewing own profile (determined by comparing IDs)
- `heroBackground: string` — computed hero gradient from profile background image (extracted via `color.js` `average()`)
- `userStats: UserStatsData | null` — library count, friends count, total play time
- `badges: Badge[]` — earned badges with unlock/equip state
- `libraryGames / pinnedGames: UserGame[]` — paginated game list
- `hasMoreLibraryGames: boolean` — pagination flag
- **Methods:** `getUserProfile()`, `getUserLibraryGames(sortBy?, reset?)`, `loadMoreLibraryGames(sortBy?)`, `equipBadge()`, `unequipBadge()`

## CloudSyncContext
**File:** `cloud-sync/cloud-sync.context.tsx`  
**Provider:** `CloudSyncProvider` (wraps game detail pages with save sync)  
**State managed:**
- `backupPreview: LudusaviBackup | null` — preview of save files (from Ludusavi)
- `artifacts: GameArtifact[]` — cloud save artifacts list
- `showCloudSyncFilesModal: boolean` — controls file picker modal
- `backupState: CloudSyncState` — enum: `New`, `Different`, `Same`, `Unknown` — compares local vs cloud saves
- **Methods:** `downloadGameArtifact(id)`, `uploadSaveGame(title)`, `deleteGameArtifact(id)`, `getGameBackupPreview()`, `getGameArtifacts()`, `toggleFileSelection()`, `selectAllFiles()`, `deselectAllFiles()`

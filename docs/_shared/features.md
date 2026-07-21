# Redux Slices

11 Redux Toolkit slices in `app/_shared/features/`. All combined in `store.ts` via `configureStore`. Actions exported from `features/index.ts`.

## `library-slice.ts` — `library`
**Purpose:** Stores the user's game library — the full list of installed/added games.  
**State:**
```typescript
{ value: LibraryGame[], searchQuery: string }
```
**Actions:**
- `setLibrary(games)` — replace entire library array
- `updateGameNewDownloadOptions({ gameId, count })` — updates `newDownloadOptionsCount` on a specific game (used when new repacks are available)
- `setSearchQuery(query)` — sets the current library search filter string

## `download-slice.ts` — `download`
**Purpose:** Tracks active download progress, extraction state, and deletion queue.  
**State:**
```typescript
{
  lastPacket: DownloadProgress | null,
  gameId: string | null,
  gamesWithDeletionInProgress: string[],
  extraction: ExtractionInfo | null,
  peakSpeeds: Record<string, number>,
  speedHistory: Record<string, number[]>,
}
```
**Actions:**
- `setLastPacket(packet)` — update download progress from main process
- `setGameId(id)` — set currently downloading game
- `setExtraction(info)` — track extraction progress (visible ID + percentage)
- `addGameDeletion(id)` / `removeGameDeletion(id)` — manage deletion queue
- `setPeakSpeed({ gameId, speed })` — record peak download speed
- `pushSpeedSample({ gameId, speed })` — push to speed history (capped at 20 entries)
- `clearDownload()` — reset all download state (used on completion/cancel)
- `startDownload(payload)` — saga-style action (handled by external listener)
- `addGameToQueue(payload)` — saga-style action for queue management

## `toast-slice.ts` — `toast`
**Purpose:** Controls the toast notification popup.  
**State:**
```typescript
{ title: string, message?: string, type: "success" | "error" | "warning", duration: number, visible: boolean }
```
**Actions:**
- `showToast({ title, message, type, duration })` — sets toast content and marks visible
- `hideToast()` — marks as hidden (triggers animation)

## `window-slice.ts` — `window`
**Purpose:** UI-level window state (not the Electron BrowserWindow).  
**State:**
```typescript
{ draggingDisabled: boolean, headerTitle: string }
```
**Actions:**
- `toggleDraggingDisabled(bool)` — enable/disable window dragging (used during modals)
- `setHeaderTitle(title)` — sets the current page title shown in the header

## `user-details-slice.ts` — `userDetails`
**Purpose:** Authenticated user data and social features.  
**State:**
```typescript
{
  userDetails: UserDetails | null,
  profileBackground: string | null,
  friendRequests: FriendRequest[],
  friendRequestCount: number,
}
```
**Actions:**
- `setUserDetails(details | null)` — login/logout, stores full user profile
- `setProfileBackground(path | null)` — profile hero image
- `setFriendRequests(requests)` — incoming friend request list
- `setFriendRequestCount(count)` — unread friend request badge count
- `clearCollections()` — clear collection state (used on sign-out)

## `game-running.slice.ts` — `gameRunning`
**Purpose:** Tracks which game is currently running.  
**State:**
```typescript
{ gameRunning: GameRunning | null }
```
**Actions:**
- `setGameRunning(running | null)` — set when a game starts/stops (includes PID, game ID, runner info)

## `runners-slice.ts` — `runners`
**Purpose:** Catalog of installed Proton/compatibility tool runners.  
**State:**
```typescript
{
  installed: RunnerEntry[],
  icons: Record<string, string | null>,
}
```
**Actions:**
- `setInstalledRunners(entries)` — replace the installed runners list
- `setRunnerIcon({ id, dataUrl })` — cache a runner's icon as data URL
- `setRunnerIcons(map)` — batch-set all runner icons

## `collections-slice.ts` — `collections`
**Purpose:** User-created game collections (e.g., "Favorites", "RPGs", "Playing Now").  
**State:**
```typescript
{ items: GameCollection[], isLoading: boolean, hasLoaded: boolean }
```
**Actions:**
- `setCollections(collections)` — full replace, sorted by name
- `addCollection(collection)` — prepend new collection
- `updateCollection(id, updates)` — partial update (name, color, cover, etc.)
- `deleteCollection(id)` — remove collection
- `addGameToCollection({ collectionId, gameId })` — add game reference
- `removeGameFromCollection({ collectionId, gameId })` — remove game reference
- `applyCollectionAssignment({ gameId, addTo, removeFrom })` — batch add/remove across collections
- `setCollectionGameIds({ collectionId, gameIds })` — explicit replace of game list
- `setCollectionsLoading(bool)` — loading state
- `clearCollections()` — reset all collection state (on sign-out)

## `catalogue-search.ts` — `catalogueSearch`
**Purpose:** Search filters and pagination for the Catalogue page.  
**State:**
```typescript
{
  filters: CatalogueSearchPayload,
  page: number,
  steamUserTags: Record<string, Record<string, number>>,
  steamGenres: Record<string, string[]>,
}
```
**Actions:**
- `setFilters(payload)` — update search filter object
- `setFilter({ key, value })` — update a single filter key
- `setPage(page)` — pagination
- `setTags(tags)` — Steam user tags cache
- `setGenres(genres)` — Steam genres cache
- `resetFilters()` — restore to initial state

## `use-preferences-slice.ts` — `userPreferences`
**Purpose:** User preferences/settings (downloader choice, theme, language, etc.).  
**State:**
```typescript
{ value: UserPreferences | null }
```
**Actions:**
- `setUserPreferences(preferences | null)` — full replace

## `subscription-slice.ts` — `subscription`
**Purpose:** Subscription/monetization modal state.  
**State:**
```typescript
{ isModalVisible: boolean }
```
**Actions:** None defined (reserved for future use).

---

## `repacks-slice.ts` — `repacks` (not in store.ts)
**Purpose:** Tracks repack options for the currently viewed game.  
**State:**
```typescript
{ value: GameRepack[] }
```
**Actions:**
- `setRepacks(repacks)` — replace the repack list
- **Note:** This slice is defined but **not registered** in `store.ts`'s `configureStore` reducer map. It may be used lazily or injected dynamically.

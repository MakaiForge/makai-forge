# Hooks

22 hooks in `app/_shared/hooks/`. Grouped by purpose.

## Redux & Store

### `redux.ts` — `useAppDispatch`, `useAppSelector`
Typed Redux hooks. `useAppDispatch` returns `AppDispatch`, `useAppSelector` accepts `RootState`. Pre-typed versions of `useDispatch` and `useSelector` from react-redux.

### `useLibrary` — library state + refresh
Reads `state.library.value` (array of `LibraryGame`). Provides `updateLibrary()` which calls `window.electron.getLibrary()` and dispatches `setLibrary`. Used by sidebar, game lists, and search.

### `useDownload` — download state + actions
Reads `lastPacket`, `progress`, `downloadSpeed`, `eta`, `isGameDeleting` from `state.download`. Returns action dispatchers: `clearDownload()`, `setLastPacket()`, `startDownload()`, `addGameToQueue()`.

### `useUserDetails` — user profile + auth management
Reads `userDetails`, `profileBackground`, `friendRequests`, `friendRequestCount` from `state.userDetails`. Provides `clearUserDetails()`, `signOut()`, `updateProfile()`, `updateProfileBackground()`, `handleFriendRequest()` (accept/reject). Wipes localStorage on sign-out.

### `useRunners` — installed runners list
Reads `state.runners.installed` and `icons`. `refresh()` fetches runners and their install statuses via IPC, dispatches `setInstalledRunners` and `setRunnerIcons`. Manages a `loading` state.

### `useRunnersRunning` — live running-runners set
Subscribes to `onRunnerStarted` / `onRunnerStopped` IPC events. Returns a `Set<string>` of runner IDs currently active. Updates in real time.

### `useGameCollections` — CRUD for game collections
Reads `state.collections.items` and `isLoading`. Provides `loadCollections()` (with request dedup via ref), `createCollection()`, `deleteCollection()`, `renameCollection()`, `applyAssignment()` (add/remove game from collection). Middleware prevents duplicate names.

### `useFeature` — feature flags from API
Fetches `/features` API on mount, caches result in `localStorage`. `isFeatureEnabled(Feature)` checks if a flag (e.g., `CHECK_DOWNLOAD_WRITE_PERMISSION`, `NIMBUS`, `NIMBUS_PREVIEW`) is active.

### `useCatalogue` — catalogue metadata filters
Fetches Steam publishers, developers, genres, tags, and download sources from local resources and stores them in Redux. Used by the Catalogue search page filter panel.

---

## UI State

### `useSectionCollapse` — collapsible sections
Manages boolean collapse state for three sections: `pinned`, `library`, `reviews`. Returns `collapseState`, `toggleSection(section)`, and individual booleans (`isPinnedCollapsed`, etc.).

### `useSearchHistory` — persistent search history
Stores up to 15 recent search queries in the key-value store (`storeService`). Each entry has `query`, `timestamp`, and `context` ("library" | "catalogue"). Provides `addEntry()`, `removeEntry()`, `clearHistory()`.

### `useSearchSuggestions` — live search suggestions
Debounced (300ms) search suggestions from library and catalogue API. Returns filtered `SearchSuggestion[]` (title, objectId, shop, iconUrl, source). Uses abort controller for cancellation and an in-memory cache. Library search is local (filters by title substring). Catalogue search calls the API when no library match is found.

### `useFormat` — locale-aware number formatting
Creates an `Intl.NumberFormat` instance for the current i18n locale. Returns `numberFormatter` (the formatter object) and `formatNumber()` (bound `.format` method). Zero decimal places by default.

### `useDate` — locale-aware date formatting
Wraps `date-fns` `formatDistance` with the correct locale from `getDateLocale()`. Also provides `formatDiffInMillis()` for relative time from a millisecond duration.

### `useGameCard` — game card interaction logic
Provides click/navigation and right-click context menu handlers for game cards. Formats play time (minutes vs hours), uses `numberFormatter` for counts, and navigates to game details via `buildGameDetailsPath`.

---

## Browser API / IPC

### `useToast` — toast notification dispatch
Dispatches `showToast` Redux action. Provides `showSuccessToast(title, message?, duration?)`, `showErrorToast(title, message?, duration?)`, `hideToast()`.

### `useClickOutside` — detect outside clicks
Returns a `ref` to attach to an element. Fires the callback when a `mousedown` event occurs outside the referenced element. Generic over `HTMLElement` (defaults to `HTMLDivElement`).

### `useDownloadOptionsListener` — new download options
Subscribes to `onNewDownloadOptions` IPC event. When the main process signals new download options for a game, dispatches `updateGameNewDownloadOptions` to update the library store.

### `useMakaiNotifications` — Makai platform notifications
Polls `getNotifications()` every 30 seconds. Tracks seen IDs via a `Set` ref to avoid duplicates/dispatch only once. Displays `showSuccessToast` for each new notification with title and body.

### `useMakaiBadges` — Makai level/badge polling
Polls `getMakaiProfile()` for user badges and XP points every 15 seconds. Compares badge IDs to detect newly earned badges and fires a callback (`onNewBadgesRef`). Returns `badges`, `points`, `registerOnNewBadges(callback)`.

### `useSupplemental` — Easter egg unlock
Tracks the last 10 keycodes. If they match a specific Konami-like sequence (defined as `SEQUENCE_LENGTH=10`), unlocks a hidden feature (`isUnlocked`). Calls `setShowTabs(true)` to reveal hidden tabs.

### `useModCompatibleGames` — mod compatibility info
Loads `getModCompatibleInfo()` once (module-level cache). Returns `isCompatible(game)` — checks if a game's Steam ID or title matches the compatibility list. Used by the Mod Manager page.

### `useSubscription` — placeholder
Empty hook returning `{}`. Reserved for future subscription modal state.

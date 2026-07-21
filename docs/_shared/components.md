# Components Catalog

## Layout

### Sidebar
**File:** `sidebar/sidebar.tsx`  
**Purpose:** Main application navigation. Resizable width (200–400px), lists route links (Home, Catalogue, Downloads, Proton Tools, Games, Mod Manager, Settings), recent/relevant games with context menu, user profile section with notification bell and Makai level. Features a collapsed/expanded mode and a custom game addition modal. Uses `useSidebarTheme` for dynamic background images.  
**Key props:** None (singleton, reads from Redux and hooks internally). Sub-components: `SidebarGameItem`, `SidebarProfile`, `SidebarAddingCustomGameModal`.  
**Routes defined in:** `sidebar/routes.tsx` — 7 routes with icons from `@primer/octicons-react`.

### BottomPanel
**File:** `bottom-panel/bottom-panel.tsx`  
**Purpose:** Persistent footer bar showing active download progress, download speed, ETA, extraction progress, and quick-access buttons (library, queue, pause all). Disappears when no download is active.  
**Key state:** Reads `lastPacket`, `progress`, `downloadSpeed`, `eta`, `extraction` from Redux download slice.

### Header
**File:** `header/header.tsx`  
**Purpose:** Renders `AutoUpdateSubHeader` — a banner that shows when a new app version is available for download/install. Listens to `window.electron.onAutoUpdaterEvent` for update status. Also contains `ScanGamesModal` for scanning the system for installed games.  
**Key props of ScanGamesModal:** `visible`, `isScanning`, `scanResult`, `onStartScan`, `onClearResult`, `onClose`.

### Hero
**File:** `hero/hero.tsx`  
**Purpose:** Featured game spotlight on the home page. Fetches trending game data from `/catalogue/featured` API, displays a large background image with title, description, and a "Get Game" button. Shows a skeleton loader while loading.  
**Key behavior:** Fetches on mount, navigates to game details on click.

---

## Data Display

### GameCard
**File:** `game-card/game-card.tsx`  
**Purpose:** Store-browsing card displaying a game's library image, title, download count, player count, rating, shop source icon (Steam), and repack badge. Used in the Catalogue page. Extends `ButtonHTMLAttributes`.  
**Key prop:** `game: ShopAssets` — contains `title`, `libraryImageUrl`, `downloads`, `players`, `rating`, `shop`, `repacker`.

### Badge
**File:** `badge/badge.tsx`  
**Purpose:** Minimal inline badge/label — wraps children in a `.badge` div. Used for download counts, repacker names, and status indicators.

### DebridBadge
**File:** `debrid-badge/debrid-badge.tsx`  
**Purpose:** A static badge showing "Powered by Debrid" with a meteor SVG icon. Has a `collapsed` boolean prop to hide text and show only the icon.

### Avatar
**File:** `avatar/avatar.tsx`  
**Purpose:** Circular user avatar. Renders an `<img>` if `src` is provided, otherwise shows a `PersonIcon` fallback. Accepts a `size` number for width/height and all native `img` attributes except `src` (which is `string | null`).

### ProgressBar
**File:** `progress-bar.tsx`  
**Purpose:** Simple horizontal progress bar. `value` (0–100) controls fill width; optional `max` defaults to 100. Clamped between 0 and 100%.

---

## Feedback

### Toast
**File:** `toast/toast.tsx`  
**Purpose:** Timed notification popup. Slides in from the top with a progress bar that counts down. Three types: `success` (green check), `error` (red X), `warning` (yellow alert). Auto-closes after `duration` ms (default 2500). Animated close on click or timer expiry.  
**Key props:** `visible`, `title`, `message?`, `type`, `duration?`, `onClose`.

### Modal
**File:** `modal/modal.tsx`  
**Purpose:** Portal-based dialog overlay with title, optional description, close button, and backdrop. Supports `large` variant, `noContentPadding`, and `clickOutsideToClose`. Fires `onClose` on Escape key or backdrop click. Animated entry/exit.  
**Key props:** `visible`, `title`, `description?`, `onClose`, `large?`, `noContentPadding?`, `clickOutsideToClose?`.

### ConfirmationModal
**File:** `confirmation-modal/confirmation-modal.tsx`  
**Purpose:** Confirm/cancel dialog built on `Modal`. Accepts `confirmButtonLabel`, `cancelButtonLabel`, `descriptionText`, `onConfirm`, `onCancel`, and `buttonsIsDisabled`. Defaults to closing modal on cancel if no `onCancel` provided.

### FullscreenMediaModal
**File:** `fullscreen-media-modal/fullscreen-media-modal.tsx`  
**Purpose:** Fullscreen overlay for viewing images/screenshots. Renders a large `<img>` with a close button. Closes on Escape key or backdrop click. Rendered via `createPortal`.  
**Key props:** `visible`, `onClose`, `src`, `alt?`.

### Backdrop
**File:** `backdrop/backdrop.tsx`  
**Purpose:** Translucent dark overlay used behind modals. Accepts an `isClosing` boolean for exit animation and `children`. Semi-transparent background with centered flex content.

---

## Inputs

### TextField
**File:** `text-field/text-field.tsx`  
**Purpose:** Themed text input with optional label, hint text, error message, and right-side content. Supports `type="password"` with a toggle visibility eye icon. Two themes: `primary` (default) and `dark`. Uses `React.forwardRef`.  
**Key props:** `label?`, `hint?`, `error?`, `theme?`, `rightContent?`, `containerProps?`, all standard input attributes.

### CheckboxField
**File:** `checkbox-field/checkbox-field.tsx`  
**Purpose:** Styled checkbox with animated check icon (from `@primer/octicons-react`). Wraps a native `<input type="checkbox">` with a custom visual. Accepts all standard input attributes plus a `label` prop (string or React node).

### RadioField
**File:** `radio-field/radio-field.tsx`  
**Purpose:** Styled radio button with customizable accent color (defaults to `--color-primary`). Supports a `leftSlot` for an icon or element before the label. Uses native `<input type="radio">` under the hood.  
**Key props:** `label`, `leftSlot?`, `accentColor?`, all standard input attributes (except type).

### SelectField
**File:** `select-field/select-field.tsx`  
**Purpose:** Themed `<select>` dropdown with optional label and two themes (`primary`, `dark`). Uses native `<select>` element with styled wrapper.  
**Key props:** `label?`, `options` (array of `{ key, value, label }`), `theme?`.

### ProtonPathPicker
**File:** `proton-path-picker/proton-path-picker.tsx`  
**Purpose:** Radio list for selecting a Proton version. Groups versions by source: `auto` (default), `fork_catalog`, `steam`, `compatibility_tools`. Each entry shows version name, source label, and an info tooltip.  
**Key props:** `versions: ProtonVersion[]`, `selectedPath`, `onChange`, `radioName`, `autoLabel`, `*SourceDescription` strings.

---

## Navigation

### Link
**File:** `link/link.tsx`  
**Purpose:** Smart link component. If `to` starts with `http`, renders an `<a>` that calls `window.electron.openExternal` (opens in system browser). Otherwise renders a React Router `<Link>`. Accepts all `LinkProps` from react-router-dom.

### SearchDropdown
**File:** `search-dropdown/search-dropdown.tsx`  
**Purpose:** Autocomplete dropdown for the search bar. Shows search history (with clock icon, removable items, clear all) and live suggestions from catalogue/library. Keyboard navigable with arrow keys and active index highlight. Rendered via `createPortal` at the body level.  
**Sub-component:** `HighlightText` (`search-dropdown/highlight-text.tsx`) — highlights matching query text within strings by splitting on query words and wrapping matches in `<mark>` tags.

### CollapsedMenu
**File:** `collapsed-menu/collapsed-menu.tsx`  
**Purpose:** Expandable/collapsible section with animated height transition. Starts open by default. Toggles on click of the title button with a chevron icon.  
**Key props:** `title` (string), `children`.

### SuspenseWrapper
**File:** `suspense-wrapper/suspense-wrapper.tsx`  
**Purpose:** Thin wrapper around React `<Suspense>` with `fallback={null}`. Accepts a `Component: LazyExoticComponent<() => JSX.Element>`. Used for code-split page loading.

---

## Overlay / Popup

### ContextMenu
**File:** `context-menu/context-menu.tsx`  
**Purpose:** Full-featured right-click context menu with submenus and separators. Rendered via `createPortal`. Supports nested submenus via `ContextMenuItemData.submenu`. Closes on outside click, Escape, or scroll. Items can be marked `danger` (red), `disabled`, or `separator`.  
**Key props:** `items: ContextMenuItemData[]`, `visible`, `position: { x, y }`, `onClose`, `children?`.

### DropdownMenu
**File:** `dropdown-menu/dropdown-menu.tsx`  
**Purpose:** Radix-based dropdown trigger menu. The trigger is `children`, clicking it opens a menu with `items` (icon + label + onClick + disabled). Configurable side (top/bottom/left/right), alignment, offset, and collision padding.  
**Key props:** `title?`, `items: DropdownMenuItem[]`, `side?`, `align?`, `sideOffset?`, `loop?`.

### GameContextMenu
**File:** `game-context-menu/game-context-menu.tsx`  
**Purpose:** Specialized context menu for library games. Wraps `ContextMenu` with game-specific actions: play, download, add to collection, add to favorites, edit, browse files, create shortcut, view on Steam, manage (properties/uninstall), and hide. Uses `useGameActions` hook for action logic.  
**Key props:** Extends `ContextMenuProps` minus `items`, plus `game: LibraryGame`.

### CreateCollectionModal
**File:** `create-collection-modal/create-collection-modal.tsx`  
**Purpose:** Modal dialog for creating a new game collection. Contains a text field for the collection name with validation (empty/duplicate name). Calls `createCollection` from `useGameCollections`.  
**Key props:** `visible`, `onClose`, `onCreated?`.

---

## Chrome Browser (Embedded)

### BrowserView
**File:** `browser-view/BrowserView.tsx`  
**Purpose:** Creates an Electron `<webview>` element dynamically and manages navigation state (URL, back/forward, loading). Used for in-app browsing (e.g., Nexus Mods). Sets a Chrome 125 user agent and persistent partition.

### BrowserMirror
**File:** `browser-view/BrowserMirror.tsx`  
**Purpose:** Full browser UI that mirrors a headless Chrome instance. Compose `BrowserTabBar` + `BrowserToolbar` + `BrowserBookmarksBar` + `BrowserFindBar` + `BrowserViewport` + `BrowserSetupScreen` + `BrowserLaunchError`. Handles mouse/wheel events forwarded to the headless browser. Supports zoom (ctrl+wheel).  
**Key props:** `defaultUrl?`, `mirrorId`.

### BrowserToolbar
**File:** `browser-view/BrowserToolbar.tsx`  
**Purpose:** Navigation toolbar with URL bar, back/forward/refresh buttons, zoom controls, mute toggle, extension popup button, and Chrome-style menu.

### BrowserTabBar
**File:** `browser-view/BrowserTabBar.tsx`  
**Purpose:** Tab bar with drag-reorder support, close buttons, favicon display, and loading spinner per tab.

### BrowserViewport
**File:** `browser-view/BrowserViewport.tsx`  
**Purpose:** Renders the mirrored browser screen as an `<img>` element. Handles context menus on tabs/page elements, extension popup display, and coordinates mouse event forwarding.

### BrowserFindBar
**File:** `browser-view/BrowserFindBar.tsx`  
**Purpose:** In-page search bar with query input, match count display, and forward/backward navigation. Toggle visibility with `findVisible`.

### BrowserBookmarksBar
**File:** `browser-view/BrowserBookmarksBar.tsx`  
**Purpose:** Horizontal bookmarks bar with context menu for navigation, open-in-new-tab, copy URL, rename, and delete actions.

### BrowserDebugBar
**File:** `browser-view/BrowserDebugBar.tsx`  
**Purpose:** Developer debug overlay showing frame count and data length from screencast frames.

### BrowserSetupScreen
**File:** `browser-view/BrowserSetupScreen.tsx`  
**Purpose:** Setup/loading screen with spinner, status text, and progress bar for browser initialization.

### BrowserLaunchError
**File:** `browser-view/BrowserLaunchError.tsx`  
**Purpose:** Error state with message and retry button when the browser fails to launch.

### Types & Utils
- **`types.ts`** — `TabInfo`, `ExtInfo`, `BrowserMirrorProps` interfaces  
- **`utils.ts`** — `CHROME_MENU_ITEMS`, `getDomain`, `getFaviconUrl`, keyboard shortcut helpers  
- **`hooks/useBrowserMirror.ts`** — Core hook managing IPC for screencast frames, mouse/keyboard events, navigation, zoom, bookmarks, extensions, and tab lifecycle  
- **`index.ts`** — Exports `BrowserView`, `BrowserViewEmpty`, `BrowserMirror`

---

## Other

### Button
**File:** `button/button.tsx`  
**Purpose:** Themed button with four themes: `primary` (filled accent), `outline` (bordered), `dark` (dark fill), `danger` (red). Supports optional tooltip via `react-tooltip` with configurable placement. Uses `useId` for tooltip association.  
**Key props:** `theme?`, `tooltip?`, `tooltipPlace?`.

### SidebarGameItem
**File:** `sidebar/sidebar-game-item.tsx`  
**Purpose:** Individual game entry in the sidebar. Shows game title, shop icon (Steam/Play), and a right-click context menu (`GameContextMenu`). Highlights if the current route matches the game's detail page.

### SidebarProfile
**File:** `sidebar/sidebar-profile.tsx`  
**Purpose:** User profile section at the top of the sidebar. Shows avatar, username, Makai level (1–100 with XP thresholds), experience bar, notification bell with unread count, and friend request count. Polls for notifications. Clicking navigates to user profile page.

### SidebarAddingCustomGameModal
**File:** `sidebar/sidebar-adding-custom-game-modal.tsx`  
**Purpose:** Modal for manually adding a non-Steam game. Fields: game name (required), executable path (with file picker), and optional download URL. Validates inputs and creates the game entry.

### ProgressBar (standalone)
**File:** `progress-bar.tsx`  
**Purpose:** Separately exported (not in a directory). Simple 0–100% fill bar. Used for download progress and other linear progress displays.

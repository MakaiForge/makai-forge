# \_shared/ — Makai Forger Shared Component Library

## Purpose

`app/_shared/` is the central UI and logic library for the Makai Forger desktop application (Electron + React + Redux). It contains all reusable React components, custom hooks, React context providers, Redux slices, utility functions, type declarations, and services used across feature pages (Catalogue, Library, Downloads, Settings, etc.).

Pages never import directly from external libraries — they import from `@components`, `@hooks`, `@context`, `@features`, `@shared-logger`, `@shared-services`, `@shared-utils`, `@shared-helpers`, and `@shared-constants`, all aliased to paths inside `_shared/`.

## Structure Overview

| Directory | Purpose |
|-----------|---------|
| `components/` | 30 React component directories — each with `.tsx` + `.scss` partials |
| `hooks/` | 22 custom React hooks for data fetching, UI state, browser APIs |
| `context/` | 4 React context providers: CloudSync, GameDetails, Settings, UserProfile |
| `features/` | 11 Redux Toolkit slices + 1 `repacks-slice` |
| `services/` | `store.service.ts` — async key-value wrapper over Electron's `store` |
| `types/` | `declaration.d.ts` (1100+ lines of Electron IPC type declarations) + `vite-env.d.ts` |
| `utils/` | `html-sanitizer.ts` + `badge-icons.tsx` (BadgeIcon component + cache) |
| `logger/` | `index.ts` — `electron-log` renderer scoped logger |
| `constants.ts` | App constants: version codename, downloader names, playtime limit |
| `helpers.ts` | 222-line utility module: formatting, i18n, colors, paths |
| `cookies.ts` | Cookie interceptor — stores cookies in `localStorage` |
| `store.ts` | Redux store configuration (configureStore with all slices) |

## Components Organization

Each component lives in its own directory with a `.tsx` file and SCSS partials following a [BEM-like naming convention](https://getbem.com/). Partials are prefixed with underscore and split by concern:

- `_layout.scss` — spacing, flexbox, grid
- `_text.scss` — font size, weight, color
- `_border.scss` — border radius, border color
- `_app-bg.scss` — background color (uses `--app-bg` CSS variable)
- `_accent.scss` — accent color overrides
- `_z-index.scss` — z-index layers

This modular SCSS approach lets each component be themed independently via CSS custom properties.

## Glass-Morphism Design System

The UI uses a **glass-morphism** aesthetic with these visual hallmarks:

- **Translucent backgrounds**: `background: rgba(...)` with backdrop blur via `--app-bg` variable
- **Border accents**: Subtle `rgba` borders on cards, modals, and dropdowns
- **Frosted panels**: Sidebar, modals, and dropdowns use `backdrop-filter: blur()` (varies by component)
- **Themed via CSS custom properties**: Colors, border radii, and shadows are driven by `--color-primary`, `--color-accent`, `--app-bg`, and theme-specific variables set by the theme engine
- **Smooth transitions**: Opacity/transform transitions on modals, dropdowns, and context menus (typically 150–200ms ease)
- **Dark-first**: All components default to dark backgrounds with light text

Color tokens are set at the `:root` level and overridden per-theme by the `ThemeProvider` in the sidebar theme hook.

## Integration Points

Pages (inside `app/Games/`, `app/Catalogue/`, `app/Home/`, etc.) import from `_shared/` via TypeScript path aliases defined in `tsconfig`:

```typescript
// In a page component:
import { Button, Modal, GameCard } from "@components";
import { useLibrary, useToast, useDownload } from "@hooks";
import { useAppSelector } from "@hooks/redux";
import { setLibrary } from "@features";
import { GameDetailsProvider } from "@context";
import { logger } from "@shared-logger";
import { formatDownloadProgress } from "@shared-helpers";
import { VERSION_CODENAME } from "@shared-constants";
import { BadgeIcon } from "@shared-utils/badge-icons";
```

## Component Subdirectories

| Subdirectory | Components |
|---|---|
| `avatar/` | `Avatar` — user avatar with fallback icon |
| `backdrop/` | `Backdrop` — translucent overlay for modals |
| `badge/` | `Badge` — inline badge label |
| `bottom-panel/` | `BottomPanel` — persistent footer with download status, ETA, quick actions |
| `browser-view/` | `BrowserView`, `BrowserMirror`, `BrowserToolbar`, `BrowserTabBar`, `BrowserViewport`, `BrowserFindBar`, `BrowserBookmarksBar`, `BrowserDebugBar`, `BrowserSetupScreen`, `BrowserLaunchError` — full embedded Chromium browser |
| `button/` | `Button` — themed button with tooltip support |
| `checkbox-field/` | `CheckboxField` — checkbox with label and check icon |
| `collapsed-menu/` | `CollapsedMenu` — expandable/collapsible section |
| `confirmation-modal/` | `ConfirmationModal` — confirm/cancel dialog |
| `context-menu/` | `ContextMenu` — right-click menu with submenus and portal rendering |
| `create-collection-modal/` | `CreateCollectionModal` — create game collection dialog |
| `debrid-badge/` | `DebridBadge` — "Powered by Debrid" badge with meteor icon |
| `dropdown-menu/` | `DropdownMenu` — Radix-based dropdown menu |
| `fullscreen-media-modal/` | `FullscreenMediaModal` — fullscreen image/video viewer |
| `game-card/` | `GameCard` — store browsing card (image, title, badges, shop logo) |
| `game-context-menu/` | `GameContextMenu` — right-click actions for library games (play, download, manage) |
| `header/` | `Header`, `AutoUpdateSubHeader`, `ScanGamesModal` — top app bar with auto-update banner |
| `hero/` | `Hero` — featured game carousel on home page |
| `link/` | `Link` — smart link (internal router + external `openExternal`) |
| `modal/` | `Modal` — portal-based dialog with backdrop, title, close button |
| `progress-bar/` | `ProgressBar` — simple progress indicator |
| `proton-path-picker/` | `ProtonPathPicker` — Proton version selector with radio list |
| `radio-field/` | `RadioField` — styled radio button with accent color |
| `search-dropdown/` | `SearchDropdown`, `HighlightText` — search autocomplete dropdown |
| `select-field/` | `SelectField` — themed `<select>` element |
| `sidebar/` | `Sidebar`, `SidebarGameItem`, `SidebarProfile`, `SidebarAddingCustomGameModal`, `Routes` — navigation sidebar with resizable width |
| `suspense-wrapper/` | `SuspenseWrapper` — React.lazy wrapper with Suspense |
| `text-field/` | `TextField` — themed input with optional password toggle, hint, error |
| `toast/` | `Toast` — timed notification popup (success/error/warning) |

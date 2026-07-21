# `app/_styles/` — Theme & Style System

## Architecture

The styling system uses a **CSS custom property token architecture** with SCSS modules, runtime theme injection via React context, and support for custom `.makaitheme` ZIP files.

**Layer stack:**
1. SCSS token files (`scss/tokens/`) — define SCSS variables that reference CSS custom properties
2. `scss/globals.scss` — declares all `:root` CSS custom property defaults + `.wallpaper-active` theme class
3. Component SCSS partials — `_body.scss`, `_reset.scss`, `_scrollbar.scss`, `_title-bar.scss`, `_container.scss`, `progress-bar.scss`
4. Runtime theme system (`theme/`) — ThemeProvider reads active theme from IndexedDB, injects custom vars/CSS, renders background layer

## File Map

### SCSS Partials (root of `_styles/`)

| File | Description |
|------|-------------|
| `_body.scss` | Base body/html/root styles: font, background, overflow, flex layout. Uses token `$body-font-size`, `$body-color`, `$dark-background-color`. |
| `_reset.scss` | CSS reset: box-sizing, button defaults, heading/paragraph margins, img drag prevention, input spinner hide, progress bar appearance reset. |
| `_scrollbar.scss` | Custom webkit scrollbar: 8px wide, dark track, white 10% thumb with hover brighten. Uses token `$dark-background-color`. |
| `_title-bar.scss` | `.title-bar` component: 35px height, dark gradient bg, glass border, drag region, cloud text accent gradient. |
| `_container.scss` | `.container` / `.container__content` layout: flex column, full viewport, scrollable content area with app-bg gradient. |
| `progress-bar.scss` | `<progress>` element styling: 6px height, accent gradient progress value, cross-browser (webkit + moz). |

### SCSS Tokens (`scss/tokens/`)

| File | Variables |
|------|-----------|
| `_app-bg.scss` | `$background-color`, `$dark-background-color` |
| `_text.scss` | `$muted-color`, `$body-color` |
| `_accent.scss` | `$success-color`, `$danger-color`, `$error-color`, `$warning-color`, `$brand-teal`, `$brand-blue`, `$brand-gradient`, `$brand-gradient-hover`, `$brand-gradient-secondary` |
| `_border.scss` | `$border-color` |
| `_sidebar.scss` | (placeholder — sidebar theme tokens) |
| `_title-bar.scss` | (placeholder — title-bar theme tokens) |
| `_header.scss` | (placeholder — header theme tokens) |
| `_bottom-panel.scss` | `$bottom-panel-z-index` |
| `_card.scss` | (placeholder — card theme tokens) |
| `_glass.scss` | `$glass-background`, `$glass-border`, `$glass-blur` + `@mixin glass`, `@mixin glass-strong` |
| `_utility.scss` | `$disabled-opacity`, `$active-opacity`, `$spacing-unit`, `$body-font-size`, `$small-font-size`, `$heading-font`, `$app-container` |
| `_z-index.scss` | `$toast-z-index`, `$title-bar-z-index`, `$backdrop-z-index`, `$modal-z-index` |

### SCSS Globals (`scss/globals.scss`)

Forwards all token files and declares:
- **`:root`** defaults for ~70 CSS custom properties covering: app-bg, text colors, accent colors, border, sidebar, title-bar, header, bottom-panel, cards, glass, z-indexes, and misc vars
- **`.wallpaper-active`** class — when a custom theme with a background image is active, all game/library cards get accent-colored glass backgrounds with backdrop-filter blur
- Wallpaper-specific overrides for cards, settings panels, mod manager, carousels, badges, and other UI surfaces

### Theme System (`theme/`)

| File | Description |
|------|-------------|
| `ThemeProvider.tsx` | React context provider. Loads active theme from IndexedDB (`storeService.values('themes')`), calls `applyThemeVars()` to inject CSS custom properties, `injectCustomCss()` for raw CSS, and renders `ThemeBackground`. Debounces theme change events (50ms). |
| `ThemeBackground.tsx` | Renders the background layer: supports `image`, `gif`, `video`, `image-url`, `video-url` types with configurable position/size/overlay. Rendered as fixed z-index: -1 behind all content. |
| `ThemeImporter.ts` | Imports themes from `.makaitheme` ZIP files (v3 format with `theme.json` + `theme.css`) or plain JSON (v2 format). Extracts CSS custom properties into `:root` vars + optional custom CSS. |
| `variables.ts` | Definitive list of ~57 themable CSS custom properties with types (`color`, `length`, `number`, `gradient`, `string`, `shadow`) and defaults. `getDefaultThemeVars()` returns all defaults. |

### How Custom Themes Work

1. User provides `.makaitheme` ZIP (v3) or JSON (v2)
2. `ThemeImporter` extracts vars + CSS + background info
3. Theme saved to IndexedDB via `storeService`
4. `ThemeProvider` loads active theme: injects CSS vars via `applyThemeVars()` + custom CSS via `injectCustomCss()`
5. `.wallpaper-active` class toggled on `<html>` when background is present
6. `ThemeBackground` renders image/video as fixed background

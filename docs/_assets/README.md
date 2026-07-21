# `app/_assets/` — UI Assets

## `backgrounds/`

| File | Purpose |
|------|---------|
| `setup.png` | Default background for the setup/splash window |
| `setup-alt.png` | Alternate background variant |

Used by `setup-window.ts` during first-run bootstrap. Displayed behind a dark gradient overlay with the "Makai Forge" title.

## `audio/`

| File | Purpose |
|------|---------|
| `achievement.wav` | Sound effect played when an achievement is unlocked |

## `assets/`

### `assets/icons/app/` — App Icons

Multi-resolution icon set for all platforms:

| File | Size |
|------|------|
| `icon.png` | Default app icon |
| `icon.icns` | macOS icon |
| `icon.ico` | Windows icon |
| `tray-icon.png` | System tray icon |
| `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png` | PNG size variants |
| `Square{30,44,71,89,107,142,150,284,310}x{30,44,71,89,107,142,150,284,310}Logo.png` | Windows Store tile icons |
| `StoreLogo.png` | Windows Store listing icon |

### `assets/icons/emulators/` — Emulator Icons

34 SVG files, one per emulator definition:
`atari800`, `blastem`, `bsnes`, `cemu`, `dolphin`, `dosbox-staging`, `duckstation`, `flycast`, `fs-uae`, `genesis-plus-gx`, `hatari`, `mame`, `mastersystem`, `mednafen`, `megadrive`, `melonds`, `mesen`, `mgba`, `mupen64plus`, `nekop2`, `pcsx2`, `ppsspp`, `quasi88`, `rpcs3`, `ryujinx`, `scummvm`, `snes9x`, `stella`, `tic80`, `vice`, `vita3k`, `xemu`, `zsnes`  
Also includes `icone.gif` and `mastersystem.svg`/`megadrive.svg`.

### `assets/icons/achievements/` — Achievement/Badge Icons

60 files: SVGs + animated GIFs for achievements and user badges:
- Distribution logos: `arch.svg`, `debian.svg`, `fedora.svg`, `ubuntu.svg`, `gentoo.svg`, `nixos.svg`, `manjaro.svg`, `opensuse.svg`, `popos.svg`, `endeavouros.svg`, `slackware.svg`, `kali.svg`, `mint.svg`
- Gaming logos: `steam.svg`, `wine.svg`, `winetricks.svg`, `windows.svg`
- Trophy GIFs: `trophy-gold.gif`, `trophy-silver.gif`, `trophy-bronze.gif`
- Icon set: `mao-na-massa.gif`, `shield.svg`, `sword.svg`, `crown.svg`, `diamond.svg`, `gem.svg`, `scroll.svg`, etc.

### `assets/` Root — Static Logos

| File | Purpose |
|------|---------|
| `coolrom.png` | CoolROM source logo |
| `freeroms.png` | FreeROMs source logo |
| `meteor.svg` | Meteor icon |
| `play-logo.svg` | "Play" action logo |
| `protondb-logo.svg` | ProtonDB badge logo |
| `romsgames.png` | ROMsGames source logo |
| `steam-deck-logo.svg` | Steam Deck verified logo |
| `steam-logo.svg` | Steam logo |

## `screenshots/` — Game Screenshot URLs

27 JSON files, one per platform. Each contains an array of Catbox.moe URLs for game screenshots:
`32x.json`, `atari2600.json`, `dreamcast.json`, `fds.json`, `gamecube.json`, `gamegear.json`, `gb.json`, `gba.json`, `gbc.json`, `genesis.json`, `lynx.json`, `mastersystem.json`, `n3ds.json`, `n64.json`, `nds.json`, `neogeo-pocket-color.json`, `neogeo-pocket.json`, `nes.json`, `pce.json`, `ps2.json`, `psp.json`, `psx.json`, `saturn.json`, `snes.json`, `virtual-boy.json`, `wonderswan-color.json`, `wonderswan.json`

## `static/icons/` — Static Icon Sets

### `static/icons/runners/` — Runner Source Badges
`linux.svg`, `lutris.svg`, `steam.svg`, `wine.svg`, `winecfg.svg`, `winetricks.svg`

### `static/icons/sources/` — Game Source Badges
`amazon.svg`, `epic.svg`, `gamejolt.svg`, `gog.svg`, `steam.svg`

### `static/icons/apps/` — Generic App Icons
`generic-runner.svg`, `generic-source.svg`, `joystick.svg`

### `static/icons/achievements/` — Achievement Icons (69 files)
Duplicate set of achievement SVGs with additional entries like `clipboard.svg`, `dialog-question.svg`, `love.svg`, `mail-read.svg`, `mail-send.svg`, `preferences-other.svg`, `preferences-system.svg`, `text-x-script.svg`, and `tux.png`.

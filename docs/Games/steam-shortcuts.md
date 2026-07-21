# Steam Shortcuts

> Criação de atalhos de jogos não-Steam na biblioteca Steam. Lê e escreve o
> arquivo binário `shortcuts.vdf` via `steam-shortcut-editor`, baixa capas da
> Steam CDN, e copia assets para a grid de cada usuário Steam.

---

## Mapa Mental

```
STEAM SHORTCUT
│
├── CRIAR
│     ├── Context menu → CreateSteamShortcutModal (OpenVR?)
│     ├── IPC → createSteamShortcut(shop, objectId)
│   ├── Busca game no armazenamento, valida executablePath
│     ├── getGameAssets() → Steam API (hero, logo, cover, library, icon)
│     ├── Download assets → <userData>/Assets/{shop}-{objectId}/
│     ├── Detecta Steam (Linux/Mac/Win)
│     ├── Lista usuários Steam (userdata/*)
│     ├── Gera appId: CRC32(exePath + title) | 0x80000000
│     ├── Para cada usuário:
│     │     ├── Lê shortcuts.vdf
│     │     ├── Pula se duplicado (por appname)
│     │     ├── Copia grid assets → {appid}_hero, _logo, p.jpg, .jpg
│     │     └── Escreve shortcuts.vdf
│   ├── Salva steamShortcutAppId no armazenamento
│     └── Linux: Cria compatdata prefix se não existir
│
├── DELETAR
│     ├── IPC → deleteSteamShortcut(shop, objectId)
│     ├── Para cada usuário: remove atalho + grid assets
│   └── Limpa steamShortcutAppId do armazenamento
│
├── VERIFICAR
│     ├── IPC → checkSteamShortcut(shop, objectId)
│     ├── Checa steamShortcutAppId no DB
│     └── Fallback: busca por executablePath/title nos shortcuts.vdf
│
└── CAPAS
      └── downloadGameCovers(steamAppId, objectId, title)
            → steamcdn / steamstatic → <userData>/game-covers/
```

---

## Fluxo de Criação (Detalhado)

```
[Usuário → Context Menu → "Create Steam Shortcut"]
       │
       ▼ CreateSteamShortcutModal (checkbox OpenVR opcional)
       │
       ▼ window.electron.createSteamShortcut(shop, objectId, { openVr })
       │
       ▼ IPC "createSteamShortcut"
       │
Main: create-steam-shortcut.ts
  1.    Busca game no armazenamento (gamesStore.get)
  2. Valida: executablePath deve existir
  3. getGameAssets(shop, objectId, gameTitle)
       → Steam Store API (icone, hero, logo, cover, library)
       → Download para <userData>/Assets/{shop}-{objectId}/
  4. getSteamLocation() ← detecção por plataforma
  5. getSteamUsersIds() ← lista diretórios em userdata/
  6. composeSteamShortcut(title, exePath, iconPath, options)
       → Gera appId: CRC32(exe + title) | 0x80000000
  7. Para cada steamUserId:
       a. Lê shortcuts.vdf (steam-shortcut-editor parseBuffer)
       b. Se appname já existe → skip (duplicate check)
       c. Cria dir grid/ se não existir
       d. Copia assets:
            {appid}_hero.jpg    ← hero.jpg
            {appid}_logo.png    ← logo.png
            {appid}p.jpg        ← cover.jpg
            {appid}.jpg         ← library.jpg
       e. Adiciona atalho ao array
       f. Escreve shortcuts.vdf (writeBuffer)
  8.    Salva steamShortcutAppId no armazenamento (game record)
  9. Linux: Cria compatdata/{appid}/pfx/ se não existir wine prefix
       │
       ▼
Renderer: Toast "Shortcut created! You might need to restart Steam"
```

---

## Steam Detection (`getSteamLocation()`)

| Plataforma | Caminho |
|------------|---------|
| **Linux** | `~/.steam/steam` → `~/.local/share/Steam` |
| **macOS** | `~/Library/Application Support/Steam` |
| **Windows** | `HKCU\Software\Valve\Steam\SteamPath` (registry) |

---

## App ID Generation

```
appId = CRC32(executablePath + gameName) | 0x80000000

- Determinístico: mesmo jogo → mesmo appId (se path/title não mudar)
- Bit 31 sempre 1 → range de non-Steam apps (>= 0x80000000)
```

---

## Estrutura de Arquivos

### shortcuts.vdf (binário)
```
<SteamLocation>/userdata/{steamUserId}/config/shortcuts.vdf
```

### Grid Assets (copiados para Steam)
```
<SteamLocation>/userdata/{steamUserId}/config/grid/
  {appid}_hero.jpg        ← hero/banner
  {appid}_logo.png        ← logo overlay
  {appid}p.jpg            ← portrait/cover
  {appid}.jpg             ← library capsule
  {appid}.ico             ← icon (removido no delete)
```

### Cache Local de Assets
```
<userData>/Assets/{shop}-{objectId}/
  icon.ico
  hero.jpg
  logo.png
  cover.jpg
  library.jpg
```

### Game Covers (download manual)
```
<userData>/game-covers/{objectId}/
  {steamAppId}_header.jpg
  {steamAppId}_profile.jpg
```

### Linux: Wine Prefix (Steam compatdata)
```
~/.local/share/Steam/steamapps/compatdata/{appid}/pfx/
```

---

## Eventos IPC

### Invoke (Renderer → Main)

| Canal | Preload | Quando |
|-------|---------|--------|
| `createSteamShortcut` | `window.electron.createSteamShortcut(shop, objectId, options?)` | Criar atalho |
| `deleteSteamShortcut` | `window.electron.deleteSteamShortcut(shop, objectId)` | Remover atalho |
| `checkSteamShortcut` | `window.electron.checkSteamShortcut(shop, objectId)` | Verificar se existe |
| `downloadGameCovers` | `window.electron.downloadGameCovers(steamAppId, objectId, title)` | Baixar capas |

---

## Tipos

```typescript
interface SteamShortcut {
  appid: number
  appname: string
  Exe: string                 // '"executablePath"'
  StartDir: string            // '"directoryPath"'
  icon: string
  ShortcutPath: string
  LaunchOptions: string
  IsHidden: boolean
  AllowDesktopConfig: boolean
  AllowOverlay: boolean
  OpenVR: boolean
  Devkit: boolean
  DevkitGameID: string
  DevkitOverrideAppID: boolean
  LastPlayTime: number
  FlatpakAppID: string
}

interface CreateSteamShortcutOptions {
  openVr?: boolean
}
```

No `Game` (store.types.ts): `steamShortcutAppId?: number`

---

## Componentes

| Componente | Arquivo | Função |
|-----------|---------|--------|
| `CreateSteamShortcutModal` | `pages/game-details/modals/create-steam-shortcut-modal.tsx` | Modal checkbox OpenVR |
| `GameContextMenu` | `components/game-context-menu/game-context-menu.tsx` | Menu "Steam Shortcut" |
| `useGameActions` | `components/game-context-menu/use-game-actions.ts` | Handler + toast |
| `SteamCoverService` | `pages/games/services/steam-cover-service.ts` | Busca capas Steam Community |

---

## Dependência

```
"steam-shortcut-editor": "git+https://github.com/protonforge/steam-shortcut-editor.git"
```

API: `parseBuffer(buffer)` → `{ shortcuts }`, `writeBuffer({ shortcuts })` → `Buffer`

---

## SteamGridDB

> ⚠️ **Não é usado no Electron.** Está apenas no servidor Node.js
> (`server/services/steam.cjs`) com `STEAMGRIDDB_API_KEY`. O app Electron
> baixa capas diretamente da CDN da Steam.

---

## Arquivos Envolvidos

| Área | Arquivos |
|------|----------|
| **Types** | `src/types/steam.types.ts` |
| **Main Service** | `src/main/services/steam.ts` |
| **Main IPC** | `src/main/events/library/create-steam-shortcut.ts`, `delete-steam-shortcut.ts`, `check-steam-shortcut.ts`, `download-game-covers.ts` |
| **Main Helpers** | `src/main/events/misc/helpers/steam-local.ts` (cache Steam API) |
| **Preload** | `src/preload/library.ts` |
| **Renderer Modals** | `src/renderer/src/pages/game-details/modals/create-steam-shortcut-modal.tsx` |
| **Renderer Components** | `src/renderer/src/components/game-context-menu/` |
| **Renderer Services** | `src/renderer/src/pages/games/services/steam-cover-service.ts` |

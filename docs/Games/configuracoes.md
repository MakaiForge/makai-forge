# Settings — Página de Configurações

> Sistema de preferências do ProtonForge. Persiste no armazenamento e sincroniza com
> o Redux store. 4 categorias na sidebar + subpáginas embutidas.

---

## Mapa Mental

```
SETTINGS
│
├── Sidebar (4 categorias)
│     ├── General ─── App Basics, Startup, Behavior, Appearance (Temas)
│     ├── Downloads ── Speed, Seed, Download Sources
│     ├── Notifications ── Download, Repack Updates
│     └── Content & Gameplay ── Autoplay, NSFW, Badges
│
├── PERSISTÊNCIA
│   ├── Armazenamento → userData/stores/app/ → key "userPreferences" (JSON)
│     └── Chave separada: "language" (string)
│
├── FLUXO: UI → settingsContext → IPC updateUserPreferences → Armazenamento → Redux
│
└── COMPONENTES LEGADOS (não na sidebar mas existem)
      ├── SettingsBehavior
      ├── SettingsGeneral
      ├── SettingsContextCompatibility
      └── SettingsContextIntegrations
```

---

## Estrutura de Navegação

```
<Settings>                              settings.tsx
  <SettingsContextProvider>
    <aside.settings__sidebar>
      ├── General        (GearIcon)     → SettingsContextGeneral
      │     ├── App Basics              (downloadsPath, language)
      │     ├── Startup Behavior        (quitInsteadHide, runAtStartup, startMinimized, launchToLibraryPage)
      │     ├── Behavior (Linux)        (enableAutoInstall)
      │     └── Appearance              → SettingsAppearance (Temas)
      │
      ├── Downloads      (DownloadIcon) → SettingsContextDownloads
      │     ├── Download Behavior       (maxSpeed, seedAfterDL, megabits, extract default)
      │     └── Download Sources        → SettingsDownloadSources + AddDownloadSourceModal
      │
      ├── Notifications  (BellIcon)     → SettingsContextNotifications
      │     └── Library Notifications   (download, repack updates)
      │
      └── Content & Gameplay (PlayIcon) → SettingsContextContentGameplay
            ├── Content Preferences     (autoplay, NSFW, explicit)
            └── Gameplay Metadata       (new download badges)
```

---

## Armazenamento

### Banco Físico
```
<userData>/stores/app/     ← appDb
```

### Chaves
```
"userPreferences"   → JSON do objeto UserPreferences completo
"language"          → string (ex: "pt-BR", "en")
```

### UserPreferences
```typescript
interface UserPreferences {
  downloadsPath?: string | null
  ggDealsApiKey?: string | null
  language?: string
  realDebridApiToken?: string | null
  premiumizeApiToken?: string | null
  allDebridApiToken?: string | null
  torBoxApiToken?: string | null
  preferQuitInsteadOfHiding?: boolean
  runAtStartup?: boolean
  startMinimized?: boolean
  launchToLibraryPage?: boolean
  disableNsfwAlert?: boolean
  hideExplicitContent?: boolean
  enableAutoInstall?: boolean
  seedAfterDownloadComplete?: boolean
  showDownloadSpeedInMegabits?: boolean
  downloadNotificationsEnabled?: boolean
  repackUpdatesNotificationsEnabled?: boolean
  friendRequestNotificationsEnabled?: boolean
  friendStartGameNotificationsEnabled?: boolean
  showDownloadSpeedInMegabytes?: boolean
  extractFilesByDefault?: boolean
  deleteArchiveFilesAfterExtractionByDefault?: boolean
  autoplayGameTrailers?: boolean
  hideToTrayOnGameStart?: boolean
  enableNewDownloadOptionsBadges?: boolean
  createStartMenuShortcut?: boolean
  maxDownloadSpeedBytesPerSecond?: number | null
  defaultProtonPath?: string | null
  autoRunMangohud?: boolean
  autoRunGamemode?: boolean
}
```

---

## Fluxo de Execução

### Startup — Carregar Configurações
```
app.tsx (useEffect)
  ├── storeService.get("userPreferences") + updateLibrary()
  ├── dispatch(setUserPreferences(preferences)) → Redux
  └── window.electron.getUserPreferences()  ← IPC invoke
        └── Main: storeGet("userPreferences") → retorna UserPreferences | null
```

### Salvamento
```
Usuário altera checkbox/campo
  → handleChange(values)
    → updateUserPreferences(values)  (settingsContext)
      → window.electron.updateUserPreferences(values)
        └── Main:
              ├── Se "language" → put separado + i18n.changeLanguage()
              ├── Merge: { ...existing, ...preferences }
              ├── Se maxDownloadSpeed → DownloadManager.applySpeedLimit()
              └── storePut("userPreferences", merged)
```

### Auto Launch (inicialização com o sistema)
```
Toggle "Run at startup"
  → window.electron.autoLaunch({ enabled, minimized })
    └── Main: app.setLoginItemSettings({ openAtLogin, openAsHidden })
```

---

## Eventos IPC

### Invoke (Renderer → Main)

| Canal | Handler | Quando |
|-------|---------|--------|
| `getUserPreferences` | `events/user-preferences/get-user-preferences.ts` | Startup, refresh pós-salvar |
| `updateUserPreferences` | `events/user-preferences/update-user-preferences.ts` | Qualquer alteração |
| `autoLaunch` | `events/user-preferences/auto-launch.ts` | Toggle "run at startup" |

### Store Genérico (usado pelo storeService)

| Canal | Uso |
|-------|-----|
| `storeGet` | `storeService.get(key, sublevel)` |
| `storePut` | `storeService.put(key, value, sublevel)` |
| `storeDel` | `storeService.del(key, sublevel)` |
| `storeClear` | `storeService.clear(sublevel)` |
| `storeValues` | `storeService.values(sublevel)` |
| `storeIterator` | `storeService.iterator(sublevel)` |

---

## Componentes

### Páginas (settings/)

| Componente | Arquivo | Função |
|-----------|---------|--------|
| `Settings` | `settings.tsx` | Raiz: sidebar + painel |
| `SettingsContextGeneral` | `settings-context-general.tsx` | App Basics, Startup, Behavior, Appearance |
| `SettingsContextDownloads` | `settings-context-downloads.tsx` | Velocidade, seed, fontes |
| `SettingsContextNotifications` | `settings-context-notifications.tsx` | Checkboxes de notificação |
| `SettingsContextContentGameplay` | `settings-context-content-gameplay.tsx` | Autoplay, NSFW, badges |
| `SettingsDownloadSources` | `settings-download-sources.tsx` | Gerenciar fontes de download |
| `SettingsDebrid` | `settings-debrid.tsx` | Serviços Debrid (RD, PM, AD, TB) |
| `SettingsAccount` | `settings-account.tsx` | Visibilidade perfil, email, senha, bloqueados |

### Modais

| Modal | Arquivo | Função |
|-------|---------|--------|
| `AddDownloadSourceModal` | `add-download-source-modal.tsx` | Adicionar fonte URL |

### Legados (fora da sidebar atual)

| Componente | Arquivo |
|-----------|---------|
| `SettingsGeneral` | `settings-general.tsx` |
| `SettingsBehavior` | `settings-behavior.tsx` |
| `SettingsContextCompatibility` | `settings-context-compatibility.tsx` |
| `SettingsContextIntegrations` | `settings-context-integrations.tsx` |

---

## Arquivos Envolvidos

| Área | Arquivos |
|------|----------|
| **Types** | `src/types/level.types.ts` (UserPreferences), `src/types/theme.types.ts` |
| **Main IPC** | `src/main/events/user-preferences/*.ts` (3 handlers) |
| **Main Armazenamento** | `src/main/store/sublevels/keys.ts`, `src/main/store/databases/app.ts` |
| **Preload** | `src/preload/app.ts` |
| **Renderer Pages** | `src/renderer/src/pages/settings/` (~20 componentes) |
| **Renderer Context** | `src/renderer/src/context/settings/settings.context.tsx` |
| **Renderer Redux** | `src/renderer/src/features/use-preferences-slice.ts` |
| **Renderer Service** | `src/renderer/src/services/store.service.ts` |

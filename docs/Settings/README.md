# Settings

Central de configurações do aplicativo com categorias em sidebar e formulários contextuais.

## Main Component

- **`settings.tsx`** — Layout com sidebar de categorias e painel de conteúdo. Usa `SettingsContextProvider`/`Consumer` para estado global da seção ativa.

## Categories

| ID | Component | File | Description |
|---|---|---|---|
| `general` | `SettingsContextGeneral` | `settings-context-general.tsx` | Idioma, comportamento (iniciar com sistema, minimizar, bandeja), aparência (tema) |
| `login` | `SettingsContextLogin` | `settings-context-login.tsx` | Autenticação na plataforma |
| `account_settings` | `SettingsContextAccountSettings` | `settings-context-account-settings.tsx` | Configurações de conta do usuário |
| `content_gameplay` | `SettingsContextContentGameplay` | `settings-context-content-gameplay.tsx` | Preferências de conteúdo e gameplay |
| `runners` | `SettingsContextRunners` | `settings-context-runners.tsx` | Gerenciamento de emuladores (instalar, remover, configurar) |

## Sub-Components

| Component | File | Role |
|---|---|---|
| `SettingsAppearance` | `appearance/settings-appearance.tsx` | Gerenciamento de temas (aplicar, importar, deletar, adicionar) |
| `ThemeCard` | `appearance/components/theme-card.tsx` | Card de tema visual |
| `ThemeActions` | `appearance/components/theme-actions.tsx` | Ações de tema (export, delete) |
| `ThemePlaceholder` | `appearance/components/theme-placeholder.tsx` | Placeholder quando não há temas |
| `AddThemeModal` | `appearance/modals/add-theme-modal.tsx` | Modal de criação de tema |
| `ImportThemeModal` | `appearance/modals/import-theme-modal.tsx` | Modal de importação |
| `DeleteThemeModal` | `appearance/modals/delete-theme-modal.tsx` | Confirmação de exclusão |
| `AddDownloadSourceModal` | `add-download-source-modal.tsx` | Modal de adicionar fonte de download (URL, validação yup) |
| `SettingsDownloadSources` | `settings-download-sources.tsx` | Gerenciamento de fontes de download |

## Hooks / State

- **`SettingsContext`** (`@context/settings`) — `currentCategoryId`, `appearance`, `updateUserPreferences`, `sourceUrl`
- **Redux**: `state.userPreferences.value` para preferências do usuário
- `useForm` + `yup` para validação de formulários

## IPC / Backend

- `window.electron.forgerApi.get/patch` — Configurações via API
- `window.electron.isPortableVersion()` — Determina disponibilidade de "iniciar com sistema"
- `window.electron.addDownloadSource(url)` — Adiciona fonte de terceiros
- `window.electron.getRunners()` — Lista emuladores disponíveis
- `window.electron.downloadRunner()/removeRunner()` — Gerenciamento de emuladores

## Routing

- Rota `/settings`
- Aba específica via `?tab=<id>` (ex: `?tab=runners`)

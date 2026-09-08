# Theme Editor

> Sistema completo de temas customizados para o ProtonForge. Permite criar, editar,
> importar da web store, e aplicar temas CSS na interface.

---

## Mapa Mental

```
THEME EDITOR
│
├── CRIAR → settings → AddThemeModal → armazenamento (temas) → aparece na lista
│
├── EDITAR → ThemeCard[pencil] → EditorWindow (Monaco) → Ctrl+S → armazenamento
│
├── APLICAR → ThemeCard[Set Theme]
│     ├── removeCustomCss() ← DOM
│     ├── injectCustomCss(code) → <style id="custom-css"> no <head>
│   └── toggleCustomTheme(id, true) ← armazenamento
│
├── IMPORTAR → Web Store → <link id="custom-css"> no <head>
│
├── SOM → Importa achievement sound da store → filesystem
│
└── STARTUP → App.tsx → loadAndApplyTheme() → injeta tema ativo
```

---

## Arquitetura

```
Renderer (theme-editor.tsx / settings-appearance.tsx)
  │
  ├── storeService.get/put/del("themes") → IPC store genérico
  ├── window.electron.openEditorWindow(themeId)
  ├── window.electron.updateCustomTheme(id, code)
  ├── window.electron.toggleCustomTheme(id, active)
  └── window.electron.onCustomThemeUpdated(listener)
        │
        ▼  IPC
Main Process
  │
  ├── themes/ (event handlers)
  │     ├── add-custom-theme.ts
  │     ├── update-custom-theme.ts
  │     ├── toggle-custom-theme.ts
  │     ├── delete-custom-theme.ts
  │     ├── delete-all-custom-themes.ts
  │     ├── get-all-custom-themes.ts
  │     ├── get-custom-theme-by-id.ts
  │     ├── get-active-custom-theme.ts
  │     ├── open-editor-window.ts
  │     ├── close-editor-window.ts
  │     ├── import-theme-sound-from-store.ts
  │     ├── get-theme-sound-path.ts
  │     └── get-theme-sound-data-url.ts
  │
  ├── window-manager.ts → EditorWindow (BrowserWindow separada)
  │
  └── Armazenamento
        └── uiDb → "themes"
```

---

## Fluxo de Execução Detalhado

### 1. Criar Tema

```
Settings → Appearance → "Create Theme"
       │
       ▼
AddThemeModal abre
       │
       ├── Usuário digita nome
       ├── Validação: min 3 chars, required
       │
       ▼
       onSubmit:
       ├── generateUUID() → id
       ├── Cria Theme { id, name, code: CSS boilerplate, isActive: false }
       └── storeService.put(id, theme, "themes")
             │
             ▼  IPC storePut
             Main: themesSublevel.put(id, theme) ← JSON
             │
             ▼
             Renderer: loadThemes() → refresh lista
```

**Default CSS boilerplate criado:**
```css
/* .header { } */
/* .sidebar { } */
/* .container__content { } */
/* .bottom-panel { } */
/* .toast { } */
/* .button { } */
```

### 2. Editar Tema (Editor Window)

```
ThemeCard → clica ícone lápis
       │
       ▼  IPC openEditorWindow
Main: WindowManager.openEditorWindow(themeId)
       │
       ├── Se já existe janela pra este tema → foca/restaura
       │
       └── Se não:
             ├── Cria BrowserWindow:
             │     ├── 720×720
             │     ├── frame oculto (titleBarStyle: "hidden")
             │     ├── URL: theme-editor?themeId=X
             │     └── Armazena em Map<themeId, BrowserWindow>
             │
             ▼
Renderer: ThemeEditor monta
       │
       ├── Lê themeId dos searchParams
       ├── storeService.get(themeId, "themes") → carrega tema
       ├── Abre Monaco editor com theme.code (CSS, vs-dark)
       │
       ├── Ctrl+S ou botão Save:
       │     └── window.electron.updateCustomTheme(id, code)
       │           │
       │           ▼  IPC
       │           Main: atualiza code + updatedAt no armazenamento
       │           └── Se isActive → envia "on-custom-theme-updated"
       │                 ├── mainWindow → App.tsx reaplica
       │                 └── notificationWindow
       │
       └── Indicador visual: "unsaved changes" (bolinha)
```

### 3. Aplicar/Remover Tema

```
ThemeCard → "Set Theme"
       │
       ▼
handleSetTheme()
       │
       ├── 1. REMOVE TEMA ATUAL
       │     ├── findActiveTheme() → busca tema com isActive=true
       │     ├── removeCustomCss() → remove <style id="custom-css"> do DOM
       │     └── window.electron.toggleCustomTheme(oldId, false)
│   └── Main: atualiza isActive=false no armazenamento
       │
       ├── 2. INJETA NOVO TEMA
       │     ├── injectCustomCss(theme.code)
       │     │     ├── Se code começa com URL → <link id="custom-css" href="...">
       │     │     └── Se não → <style id="custom-css">{code}</style>
       │     └── window.electron.toggleCustomTheme(id, true)
│   └── Main: atualiza isActive=true no armazenamento
       │                 └── Envia "on-custom-theme-updated" pra notificationWindow
       │
       └── refresh lista
```

### 4. Aplicar Tema no Startup

```
App.tsx monta
       │
       ▼
loadAndApplyTheme()
       │
       ├── storeService.values("themes") → todos os temas
       ├── find(isActive === true)
       │     ├── Achou? → injectCustomCss(theme.code)
       │     └── Não? → removeCustomCss()
       │
       └── Registra listener:
             window.electron.onCustomThemeUpdated(() => loadAndApplyTheme())
```

### 5. Importar da Web Store

```
Usuário vem de link externo com params: theme, authorId, authorName
       │
       ▼
ImportThemeModal abre
       │
       ▼
handleImportTheme()
       │
       ├── Cria Theme {
       │     code: "https://protonforge-themes.shop/themes/{nome}/theme.css"
       │     isActive: false
       │   }
       │
       ├── storeService.put(id, theme, "themes")
       │
       ├── window.electron.importThemeSoundFromStore(themeName)
       │     └── Main: download achievement sound → filesystem/themes/{nome}/
       │
       ├── removeCustomCss() ← tema antigo
       ├── injectCustomCss(theme.code) ← <link href="...">
       ├── toggleCustomTheme(id, true)
       │
       └── Toast: tema importado + aplicado
```

### 6. Deletar Tema

```
ThemeCard → lixeira → DeleteThemeModal
       │
       ├── Se ativo: removeCustomCss()
       ├── storeService.del(id, "themes")
       └── window.electron.closeEditorWindow(themeId)
             └── Main: WindowManager.closeEditorWindow(id)
                   └── Fecha BrowserWindow do editor se aberta
```

---

## Como os Temas Funcionam (CSS Injection)

**Não usa CSS variables.** Injeta CSS diretamente no `<head>` via elemento `<style>` ou `<link>`.

```typescript
// src/renderer/src/helpers.ts
export const injectCustomCss = (css, target = document.head) => {
  target.querySelector("#custom-css")?.remove()

  if (css.startsWith(THEME_WEB_STORE_URL)) {
    // Tema remoto
    const link = document.createElement("link")
    link.id = "custom-css"
    link.rel = "stylesheet"
    link.href = css
    target.appendChild(link)
  } else {
    // Tema local
    const style = document.createElement("style")
    style.id = "custom-css"
    style.textContent = css
    target.appendChild(style)
  }
}

export const removeCustomCss = (target = document.head) => {
  target.querySelector("#custom-css")?.remove()
}
```

**Só UM tema ativo por vez** — o elemento `#custom-css` é único no DOM.

---

## Editor Window (Janela Separada)

```
WindowManager.editorWindows: Map<string, BrowserWindow>
       │
       ├── createEditorWindow(themeId)
       │     ├── 720×720, titleBarStyle: hidden
       │     ├── URL: /theme-editor?themeId={id}
       │     ├── show: false (carrega oculta)
       │     ├── webContents.on("did-finish-load") → show()
       │     └── closed → remove do Map
       │
       ├── openEditorWindow(themeId)
       │     ├── Se existe → focus + restore
       │     └── Se não → createEditorWindow()
       │
       └── closeEditorWindow(themeId?)
             ├── Se themeId → fecha daquele tema
             └── Se null → fecha TODAS
```

---

## Armazenamento

### Físico
```
<userData>/stores/ui/     ← Banco de dados
```

### Sublevel
```
sublevel "themes" → chave: themeId (UUID)  valor: Theme (JSON)
```

### Interface
```typescript
interface Theme {
  id: string
  name: string
  author?: string           // user ID
  authorName?: string       // display name
  isActive: boolean
  code: string              // CSS ou URL
  hasCustomSound?: boolean
  originalSoundPath?: string
  createdAt: Date
  updatedAt: Date
}
```

### Sound Files (Filesystem)
```
<userData>/themes/{themeName}/achievement.{wav|mp3|ogg|m4a}
```

---

## Eventos IPC

### Invoke (Renderer → Main)

| Canal | Quando | Descrição |
|-------|--------|-----------|
| `addCustomTheme` | Criar tema | Salva novo tema no armazenamento |
| `updateCustomTheme` | Ctrl+S no editor | Atualiza code + dispara refresh |
| `toggleCustomTheme` | Set/Unset theme | Alterna isActive |
| `deleteCustomTheme` | Deletar um tema | Remove do armazenamento |
| `deleteAllCustomThemes` | Limpar tudo | Limpa sublevel inteiro |
| `getAllCustomThemes` | Carregar lista | Retorna todos os temas |
| `getCustomThemeById` | Abrir editor | Carrega tema específico |
| `getActiveCustomTheme` | Startup/refresh | Tema atualmente ativo |
| `openEditorWindow` | Clicar lápis | Abre janela do Monaco |
| `closeEditorWindow` | Deletar tema | Fecha janela do editor |
| `importThemeSoundFromStore` | Importar tema | Download + salva sound file |
| `getThemeSoundPath` | UI de som | Path do arquivo de som |
| `getThemeSoundDataUrl` | UI de som | Base64 do som |

### Push (Main → Renderer)

| Canal | Quando | Efeito |
|-------|--------|--------|
| `on-custom-theme-updated` | toggle/update | Reaplica tema + refresh lista |

### Store Genérico (usado pelo storeService)

| Canal | Uso |
|-------|-----|
| `storeGet` | `storeService.get(key, "themes")` |
| `storePut` | `storeService.put(key, value, "themes")` |
| `storeDel` | `storeService.del(key, "themes")` |
| `storeClear` | `storeService.clear("themes")` |
| `storeValues` | `storeService.values("themes")` |

---

## UI Components

| Componente | Arquivo | Função |
|-----------|---------|--------|
| `ThemeEditor` | `pages/theme-editor/theme-editor.tsx` | Monaco editor fullscreen |
| `SettingsAppearance` | `pages/settings/appearance/settings-appearance.tsx` | Lista de temas + ações |
| `ThemeCard` | `.../components/theme-card.tsx` | Card de cada tema |
| `ThemeActions` | `.../components/theme-actions.tsx` | Botões: Web Store, Create, Clear |
| `ThemePlaceholder` | `.../components/theme-placeholder.tsx` | Estado vazio |
| `AddThemeModal` | `.../modals/add-theme-modal.tsx` | Modal de criação |
| `DeleteThemeModal` | `.../modals/delete-theme-modal.tsx` | Confirmar deleção |
| `DeleteAllThemesModal` | `.../modals/delete-all-themes-modal.tsx` | Confirmar limpar tudo |
| `ImportThemeModal` | `.../modals/import-theme-modal.tsx` | Importar da web store |

---

## Arquivos Envolvidos

| Área | Arquivos |
|------|----------|
| **Types** | `src/types/theme.types.ts` |
| **Main IPC** | `src/main/events/themes/*.ts` (13 handlers) |
| **Main Window** | `src/main/services/window-manager.ts` |
| **Main Armazenamento** | `src/main/store/sublevels/themes.ts`, `databases/ui.ts` |
| **Preload** | `src/preload/app.ts` |
| **Renderer Page** | `src/renderer/src/pages/theme-editor/` |
| **Renderer Settings** | `src/renderer/src/pages/settings/appearance/` (7 componentes) |
| **Renderer App** | `src/renderer/src/app.tsx` (loadAndApplyTheme) |
| **Renderer Helpers** | `src/renderer/src/helpers.ts` (injectCustomCss, removeCustomCss) |
| **Renderer Service** | `src/renderer/src/services/store.service.ts` |

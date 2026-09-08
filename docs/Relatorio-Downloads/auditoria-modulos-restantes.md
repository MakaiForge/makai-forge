# Auditoria: Módulos Restantes

> Data: 2026-08-18
> Escopo: EmulatorDetail, ExecutableSelect, FolderSelect, SharedModals, ThemeEditor, Library, _shared

---

## 1. EmulatorDetail

### Arquivos
```
app/EmulatorDetail/
├── emulator-detail.tsx        — Página detalhe do emulador
├── components/
│   ├── screenshot-slideshow.tsx
│   ├── play-button.tsx
│   ├── sites-tabs.tsx
│   ├── site-preview.tsx
│   └── add-site-modal.tsx
└── hooks/
    ├── use-runner-process.ts
    ├── use-extra-sites.ts
    ├── use-screenshots.ts
    └── use-emulator.ts
```

### Problemas

| # | Severidade | Problema | Arquivo |
|---|-----------|----------|---------|
| 1 | 🟡 Médio | `console.error` em produção | `use-runner-process.ts:34,51` |
| 2 | 🟡 Médio | `localStorage` para extra sites (pode perder dados) | `use-extra-sites.ts` |
| 3 | 🟢 Menor | `SitePreview` usa webview sem partition | `site-preview.tsx` |

---

## 2. ExecutableSelect

### Arquivos
```
app/ExecutableSelect/
├── executable-select.tsx
└── executable-select.scss
```

### Problemas

| # | Severidade | Problema | Arquivo |
|---|-----------|----------|---------|
| 1 | 🟡 Médio | `console.error` em produção (2x) | `executable-select.tsx:53,72` |
| 2 | 🟢 Menor | `formatFileSize` duplicado (existe em outros arquivos) | `executable-select.tsx` |

---

## 3. FolderSelect

### Arquivos
```
app/FolderSelect/
├── folder-select.tsx
└── folder-select.scss
```

### Problemas

| # | Severidade | Problema | Arquivo |
|---|-----------|----------|---------|
| 1 | 🟡 Médio | `console.error` em produção | `folder-select.tsx:74` |
| 2 | 🟢 Menor | `formatFileSize` duplicado | `folder-select.tsx` |

---

## 4. SharedModals

### Arquivos
```
app/SharedModals/
├── binary-not-found-modal.tsx
├── install-script-modal.tsx
└── protonforge-cloud/
    └── protonforge-cloud-modal.tsx
```

### Problemas

| # | Severidade | Problema | Arquivo |
|---|-----------|----------|---------|
| 1 | 🟡 Médio | **17x `(window as any).electron`** — bypass total de tipos | `install-script-modal.tsx` |
| 2 | 🟡 Médio | `window.open` com `mailto:` — abre email client externo | `install-script-modal.tsx:339` |
| 3 | 🟡 Médio | Inline styles extensos (~20 ocorrências) | `install-script-modal.tsx` |
| 4 | 🟢 Menor | Múltiplos `catch {}` vazios (ignoram erros) | `install-script-modal.tsx` |

---

## 5. ThemeEditor

### Arquivos
```
app/ThemeEditor/
├── theme-editor.tsx
└── theme-editor.scss
```

### Problemas

| # | Severidade | Problema | Arquivo |
|---|-----------|----------|---------|
| 1 | 🟡 Médio | **Sem validação de CSS** — temas maliciosos podem quebrar o app | `theme-editor.tsx` |
| 2 | 🟡 Médio | `window.document.title` hardcoded | `theme-editor.tsx:18` |
| 3 | 🟢 Menor | `style={{ position: "absolute" }}` inline | `theme-editor.tsx:115-120` |

---

## 6. Library

### Arquivos
```
app/Library/
├── library.tsx
├── library-game-card.tsx
├── library-game-card-large.tsx
├── filter-options.tsx
├── view-options.tsx
└── library.scss
```

### Problemas

| # | Severidade | Problema | Arquivo |
|---|-----------|----------|---------|
| 1 | 🟡 Médio | `localStorage` para viewMode/sortBy (pode perder) | `library.tsx:58-66` |
| 2 | 🟡 Médio | Busca subsequence sem debounce | `library.tsx:230-240` |
| 3 | 🟢 Menor | `handleOnMouseEnterGameCard` / `handleOnMouseLeaveGameCard` são callbacks vazios | `library.tsx:185-191` |
| 4 | 🟢 Menor | `listStyle: "none"` inline | `library.tsx:340` |

---

## 7. _shared (Core)

### Arquivos Principais
```
app/_shared/
├── components/     — ~30 componentes reutilizáveis
├── context/        — React contexts
├── features/       — Redux slices
├── hooks/          — Custom hooks
├── services/       — Serviços compartilhados
├── helpers.ts      — Funções utilitárias
├── constants.ts    — Constantes
└── store.ts        — Redux store
```

### Problemas

| # | Severidade | Problema | Arquivo |
|---|-----------|----------|---------|
| 1 | 🟡 Médio | `console.error` em produção (5x) | `sidebar.tsx`, `helpers.ts`, `game-details.context.tsx`, `cookies.ts` |
| 2 | 🟡 Médio | `console.log` em produção (1x) | `game-details.context.tsx:344` |
| 3 | 🟡 Médio | `BrowserViewport` usa `console.log` em onLoad | `BrowserViewport.tsx:97` |
| 4 | 🟢 Menor | Inline styles em componentes shared (23 ocorrências) | múltiplos |

---

## 8. Resumo Geral

| Módulo | Bugs | Prioridade |
|--------|------|-----------|
| EmulatorDetail | 3 | Baixa |
| ExecutableSelect | 2 | Baixa |
| FolderSelect | 2 | Baixa |
| SharedModals | 4 | Média |
| ThemeEditor | 3 | Média |
| Library | 4 | Baixa |
| _shared | 4 | Média |
| **Total** | **22** | |

### Prioridades de Fix

1. **SharedModals** — `(window as any)` 17x (tipagem quebrada)
2. **_shared** — `console.error/log` em produção (5x)
3. **ThemeEditor** — Sem validação de CSS (risco de quebra)
4. **EmulatorDetail** — `console.error` + webview sem partition
5. **Execut
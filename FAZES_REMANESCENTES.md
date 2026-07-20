# Fases Remanescentes — Modularização para `app/`

## Objetivo
Mover **todo o código** de `src/renderer/src/` para `app/`, deixando apenas `main.tsx` + configs. Nada em `src/`.

---

## Fase 1 — `app/_shared/infra/` (componentes, hooks, context, services, utils, features, store)

### 1.1 Criar `app/_shared/components/`
- Mover `src/renderer/src/components/` → `app/_shared/components/`
- Atualizar `app/_shared/components/index.ts` barrel
- Atualizar alias `@components` → `app/_shared/components`

### 1.2 Criar `app/_shared/hooks/`
- Mover `src/renderer/src/hooks/` → `app/_shared/hooks/`
- Atualizar alias `@hooks` → `app/_shared/hooks`

### 1.3 Criar `app/_shared/context/`
- Mover `src/renderer/src/context/` → `app/_shared/context/`
- Atualizar alias `@context` → `app/_shared/context`

### 1.4 Criar `app/_shared/services/`
- Mover `src/renderer/src/services/` → `app/_shared/services/`

### 1.5 Criar `app/_shared/utils/`
- Mover `src/renderer/src/utils/` → `app/_shared/utils/`

### 1.6 Criar `app/_shared/features/`
- Mover `src/renderer/src/features/` → `app/_shared/features/`

### 1.7 Criar `app/_shared/logger/`
- Mover `src/renderer/src/logger/` + `src/renderer/src/logger.ts` → `app/_shared/logger/`

### 1.8 Mover raiz infra
- `src/renderer/src/store.ts` → `app/_shared/store.ts`
- `src/renderer/src/constants.ts` → `app/_shared/constants.ts`
- `src/renderer/src/helpers.ts` → `app/_shared/helpers.ts`
- `src/renderer/src/cookies.ts` → `app/_shared/cookies.ts`
- `src/renderer/src/declaration.d.ts` → `app/_shared/types/declaration.d.ts`

### 1.9 Adicionar aliases no `electron.vite.config.ts` + `tsconfig.web.json`

---

## Fase 2 — `app/_styles/` (scss, tema, estilos globais)

### 2.1 `app/_styles/scss/`
- Mover `src/renderer/src/scss/` → `app/_styles/scss/`

### 2.2 `app/_styles/theme/`
- Mover `src/renderer/src/theme/` → `app/_styles/theme/`

### 2.3 Root SCSS files
- Mover `_body.scss`, `_container.scss`, `_reset.scss`, `_scrollbar.scss`, `_title-bar.scss`, `progress-bar.scss` → `app/_styles/`

### 2.4 `app.scss`
- Mover `src/renderer/src/app.scss` → `app/app.scss`

---

## Fase 3 — `app/_assets/` (assets, screenshots, ícones)

### 3.1 `app/_assets/`
- Mover `src/renderer/src/assets/` → `app/_assets/`

### 3.2 `app/_assets/screenshots/`
- Mover `src/renderer/src/screenshots/` → `app/_assets/screenshots/`

---

## Fase 4 — `app/app.tsx` (shell da app)

### 4.1
- Mover `src/renderer/src/app.tsx` → `app/app.tsx`

---

## Fase 5 — Limpeza final

### 5.1
- `src/renderer/src/` vira SÓ `main.tsx` + `vite-env.d.ts`
- Remover alias `@renderer` — substituir por aliases específicos (`@components`, `@hooks`, etc.)
- Atualizar todos os 60+ imports de `@renderer/...` nos arquivos em `app/`
- Verificar build: `npx electron-vite build`
- Deletar o que sobrou em `src/renderer/src/`
- Remover symlink `scss/` da raiz do projeto (se aplicável)

---

## Ordem de execução

```
Fase 1 (infra compartilhada)
  ↓
Fase 2 (styles + theme)
  ↓
Fase 3 (assets)
  ↓
Fase 4 (app.tsx)
  ↓
Fase 5 (limpeza, aliases, build)
```

Cada sub-fase = 1 commit. Build verificado após cada commit.

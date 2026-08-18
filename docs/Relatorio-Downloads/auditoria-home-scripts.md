# Auditoria: Home, Scripts & ThemeEditor

> Data: 2026-08-18
> Escopo: `app/Home/` (~420 linhas), `app/Scripts/` (~410 linhas), `app/ThemeEditor/` (~110 linhas)

---

## 1. Visão Geral

### Home (420 linhas)
- **home.tsx** — Página inicial com 2 tabs: Início, Navegador
- **hooks/useHomeData.ts** — Busca de deals, news, free games (cache + fresh)
- **components/news-carousel/** — Carousel de notícias com auto-advance
- **components/featured-deals/** — Promoções em destaque
- **components/free-games/** — Jogos grátis

### Scripts (410 linhas)
- **install-script.tsx** — Instalação de scripts da comunidade
- Fluxo: busca script → instala Proton → executa → seleciona exe

### ThemeEditor (110 linhas)
- **theme-editor.tsx** — Editor de temas simples

---

## 2. Problemas Identificados

### 🔴 Críticos

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 1 | **`install-script.tsx` usa `alert()` nativo** | `install-script.tsx:133` | `alert(result.error)` — modal nativo, não segue design system, bloqueia UI. |
| 2 | **`install-script.tsx` 11x `(window as any).electron`** | `install-script.tsx` | Usa `(window as any).electron` em vez de tipos do preload. Se o preload mudar, quebra silenciosamente. |
| 3 | **`install-script.tsx` auto-install após 800ms** | `install-script.tsx:88-92` | `setTimeout(() => setAutoInstall(true), 800)` — instala automaticamente sem confirmação do usuário. |
| 4 | **`install-script.tsx` inline styles extensos** | `install-script.tsx` | ~80 linhas de `style={{...}}` hardcoded. Mesmo problema que em Settings. |

### 🟡 Médios

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 5 | **`useHomeData` duplo fetch** | `useHomeData.ts:45-55` | Chama `loadCached()` E `loadFresh()` simultaneamente. Dados são fetchados 2x. |
| 6 | **`useHomeData` `cancelled` flag** | `useHomeData.ts:28` | `cancelled` é setado no cleanup mas o `loadFresh` pode já ter iniciado. Race condition leve. |
| 7 | **`news-carousel` timer manual** | `news-carousel.tsx:17-29` | `setInterval` manual para auto-advance. Deveria usar CSS animation ou library. |
| 8 | **`install-script.tsx` `catch {}` vazio** | `install-script.tsx:155` | `catch { setInstalling(false); }` — erro ignorado silenciosamente. |

### 🟢 Menores

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 9 | **Home hardcoded "pt-BR"** | `home.tsx:9` | `const userLang = i18n.language \|\| "pt-BR"` — fallback hardcoded. |
| 10 | **`ThemeEditor` sem proteção** | `theme-editor.tsx` | Editor sem validação de input. Temas maliciosos podem quebrar o app. |

---

## 3. Fluxo: Instalação de Script

```
1. Usuário clica em link "makai://script/123"
   │
2. InstallScript monta
   │
3. useEffect: setTimeout(800ms) → autoInstall = true
   │
4. handleInstall()
   │
   ├─ installScript(scriptId)
   │    │
   │    ├─ Verifica Proton (se script define)
   │    ├─ Baixa/instala Proton se necessário
   │    ├─ Instala jogo
   │    └─ Retorna candidates
   │
   ├─ Se candidates → ExecutableCandidateModal
   │    └─ Usuário seleciona → setGameExecutablePath()
   │
   ├─ Se executableSelectWindowOpened → janela separada
   │
   └─ Se nenhum → openExeFilePicker() → setGameExecutablePath()
```

---

## 4. Recomendações

### Prioridade Alta

1. **Substituir `alert()`** por toast/modal do design system
2. **Tipar `window.electron`** em vez de `(window as any)`
3. **Remover auto-install** — pedir confirmação ao usuário

### Prioridade Média

4. Externalizar inline styles para CSS
5. Unificar fetch cached/fresh em useHomeData
6. Adicionar error logging em catch

### Prioridade Baixa

7. Remover fallback hardcoded "pt-BR"
8. Adicionar validação no ThemeEditor

# Auditoria: Catalogue & Emulators

> Data: 2026-08-18
> Escopo: `app/Catalogue/` (~1280 linhas), `app/Emulators/` (~290 linhas)

---

## 1. Visão Geral

### Catalogue (1280 linhas)
- **index.tsx** — Página principal de catálogo de jogos
- **hooks/useCatalogueSearch.ts** — Busca com debounce (500ms)
- **hooks/useCatalogueFilters.ts** — Filtros por gênero, tag, dev, publisher, source
- **components/game-item/** — Card do jogo no catálogo
- **components/filter-item/** — Badge de filtro ativo
- **components/filter-section/** — Seção de filtros expansível
- **components/pagination/** — Paginação

### Emulators (290 linhas)
- **emulators.tsx** — Página de emuladores instalados
- Cards com play/stop, sites de ROMs, webview embutido

---

## 2. Problemas Identificados

### 🔴 Críticos

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 1 | **`webview` com `disablewebsecurity`** | `emulators.tsx:276` | `<webview webpreferences="disablewebsecurity">` desabilita segurança do webview. Sites de ROMs maliciosos podem executar código arbitrário. Mesmo problema em `Downloads/index.tsx:180`. |
| 2 | **`prompt()` nativo para adicionar site** | `emulators.tsx:61-63` | `prompt("Nome do site:")` — nativo, não valida URL, não segue design system. Aceita qualquer string. |
| 3 | **`useCatalogueSearch` debounced 500ms sem cancel no unmount** | `useCatalogueSearch.ts:80` | `debouncedSearch.cancel()` é chamado no cleanup do `useEffect`, mas o debounce ref pode não estar limpo se o componente desmontar durante uma busca ativa. |

### 🟡 Médios

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 4 | **`emulators.tsx` `console.error` em produção** | `emulators.tsx:120` | `console.error("Erro ao lançar:", err)` — dados sensíveis logados. |
| 5 | **`emulators.tsx` `extraSites` em localStorage** | `emulators.tsx:25-32` | Sites de ROMs custom ficam no localStorage. Se limpar localStorage, perde. Deveria usar store. |
| 6 | **`useCatalogueFilters` `steamGenresMapping` pode ser vazio** | `useCatalogueFilters.ts:20-28` | Se `steamGenres[language]` não existe, retorna `{}`. Filtros de gênero ficam vazios sem aviso. |
| 7 | **`useCatalogueSearch` `pirateBatch` silently fails** | `useCatalogueSearch.ts:55-65` | Se `getGameDataBatch` falhar, `catch {}` ignora silenciosamente. Usuário não vê fontes de download. |
| 8 | **`emulators.tsx` `handlePlay` recria callback a cada render** | `emulators.tsx:105` | `handlePlay` depende de `selectedRom` e `running`. Se `running` muda, callback é recriado, causando re-renders desnecessários. |
| 9 | **`useCatalogueSearch` `hasResultsRef` não é resetado** | `useCatalogueSearch.ts:72` | `hasResultsRef` é setado mas nunca resetado. Se o usuário limpa filtros, `isLoading` pode não mostrar skeleton. |
| 10 | **`game-item.tsx` `console.error`** | `game-item.tsx:73` | `console.error(error)` — erro de render logado. |

### 🟢 Menores

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 11 | **`emulators.tsx` `CATEGORY_LABELS` duplicado** | `emulators.tsx:6-14` | Mesmo objeto que em `settings-context-runners.tsx`. Deveria ser compartilhado. |
| 12 | **`useCatalogueFilters` `decodeHTML` inline** | `useCatalogueFilters.ts:14` | Função `decodeHTML` poderia ser um util compartilhado. |
| 13 | **`emulators.tsx` webview sem sandbox** | `emulators.tsx:273-276` | Webview não tem `partition` ou `useragent` customizado. |

---

## 3. Fluxo de Dados

```
Catalogue
  │
  ├─ useCatalogueSearch()
  │    ├─ Redux: catalogueSearch (filters, page)
  │    ├─ forgerApi.post("/catalogue/search")
  │    ├─ getGameDataBatch() → merge download sources
  │    └─ Polling: supplemental-unlocked event
  │
  └─ useCatalogueFilters()
       ├─ steamGenres, steamUserTags (do catalogue store)
       ├─ steamDevelopers, steamPublishers
       └─ downloadSources (do useCatalogue hook)

Emulators
  │
  ├─ useRunners() → installed, icons
  ├─ getRunners() → all definitions
  ├─ launchGame(runnerId, romPath)
  ├─ closeRunner(runnerId)
  └─ localStorage: extraSites
```

---

## 4. Segurança: webview disablewebsecurity

```tsx
// emulators.tsx:273-276
<webview
  src={activeSiteTab}
  style={{ width: "100%", height: "100%" }}
  webpreferences="disablewebsecurity"
/>

// Downloads/index.tsx:177-180
<webview
  src={qbitUrl}
  webpreferences="disablewebsecurity"
/>
```

**Risco:** Qualquer site carregado no webview pode:
- Executar JavaScript arbitrário
- Acessar APIs do sistema
- Roubar dados de outros webviews

**Fix recomendado:** Usar `partition` isolado + `sandbox` + Content Security Policy.

---

## 5. Recomendações

### Prioridade Alta

1. **Remover `disablewebsecurity`** dos webviews — usar sandbox
2. **Substituir `prompt()`** por modal customizado
3. **Mover `extraSites`** do localStorage para store

### Prioridade Média

4. Remover `console.error` em produção
5. Compartilhar `CATEGORY_LABELS`
6. Adicionar error handling para `pirateBatch`

### Prioridade Baixa

7. Otimizar `handlePlay` com `useCallback` correto
8. Externalizar `decodeHTML`
9. Adicionar sandbox ao webview

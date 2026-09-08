# Análise Completa — Aba Mod Manager

**Data:** 30 Jun 2026
**Analisado contra:** Amethyst 1.3.12, ModSanity 0.1.7.1, MO2 Linux Installer 6.0.6

---

## Sumário Executivo

O Mod Manager do Makai Forge está **muito bem modularizado** para um app Electron/React. A separação em 14 hooks, 13 IPC handlers, 6 modais componentizadas, e SCSS em partials de no máximo 161 linhas é excelente. Comparado aos 3 projetos de referência, o nosso está **em pé de igualdade ou melhor** em organização de frontend, mas **atrás** no backend Python (Amethyst tem 60 Utils / 25.9K linhas, nós temos ~8 Utils / ~3K linhas).

---

## 1. Arquitetura vs. Concorrentes

### 1.1 Amethyst Mod Manager (Python + CustomTkinter)

```
Amethyst                    Makai Forge
─────────                   ───────────
gui/ (68 arquivos)          renderer/pages/mods/ (412 arquivos)
Utils/ (60 arquivos)        main/events/mods/ (13 handlers)
Games/ (27 handlers)        main/services/ (4 serviços)
Nexus/ (5 arquivos)         python/Utils/ (8 módulos)
LOOT/ (2 arquivos)          python/bridge/ (1 bridge)

25.927 linhas Python        ~4.068 TS + ~3.234 SCSS + ~3.000 Python
```

**O que Amethyst tem que falta no Makai:**
- **Deploy em 6 submódulos** (`deploy_shared.py` 1.707L, `deploy_standard.py`, `deploy_root.py`, `deploy_game_root.py`, `deploy_custom_rules.py`, `deploy_wine_dll.py`) — nosso `mod-deploy-service.ts` tem 564L monolítico
- **Perfis completos** com modlist + plugins + separators + FOMOD selections + filemap + locks por perfil
- **27 game handlers** (Skyrim, Fallout, Cyberpunk, etc.) cada um herdando `BaseGame` com deploy_rules próprias
- **BAIN installer** (Wrye Bash)
- **LOOT nativo** com libloot (C++ bindings) + userlist editing + grupos
- **Nexus API** completa (auth OAuth, download manager, collections, nxm:// protocol handler)
- **Workshop** integration
- **Collections** (Nexus) com instalação em lote + FOMOD deferred
- **Prefix manager** completo com DLL overrides

**O que Makai tem melhor que Amethyst:**
- Virtual scrolling com `@tanstack/react-virtual` (perfeito para 500+ mods)
- Split pane redimensionável com drag
- SCSS modular com partials (~161L máx)
- Electron IPC separa frontend do backend de forma mais limpa
- Tema customizável via CSS vars (Amethyst usa CTk theme JSON fixo)
- FOMOD dialog componentizado (Amethyst tem 1.160L monolítico)

### 1.2 ModSanity (Rust CLI/TUI)

```
ModSanity                       Makai Forge
─────────                       ───────────
Cargo.toml + Rust src           package.json + React + Python
CLI + TUI (ratatui)             GUI (Electron/React)
SQLite (modlists DB)            SQLite (ModStorageService)
Symlink/hardlink/copy deploy    Symlink deploy (bridge Python)
FOMOD + wizard TUI              FOMOD dialog (React)
LOOT CLI (optional externo)     LOOT masterlist (Python, nosso)
```

**O que ModSanity tem que falta no Makai:**
- **Modlists com import/export** (formato nativo + MO2) — salva/restaura listas de mods
- **Queue system** com batch downloads, retry, download-only mode
- **Profile export/import** completo
- **Doctor command** — diagnóstico do ambiente
- **Rescan staging** — adiciona/atualiza mods existentes no DB, re-index files/plugins
- **MO2 migration bridge** — importa estado de enable/disable de plugins do MO2
- **SKSE override behavior** — SKSE .exe/.dll sempre copiados (nunca link)
- **Nexus catalog** — popula catálogo local via REST com paginação

**O que Makai tem melhor que ModSanity:**
- GUI visual com drag-and-drop, preview de imagens, editor INI
- Proton Tools integrado (download de forks, recomendação)
- Game discovery via Steam finder
- BSA invalidation
- ESLifier integrado

### 1.3 MO2 Linux Installer (Shell Script)

```
MO2 Linux Installer              Makai Forge
──────────────────               ───────────
Shell script de instalação       App completo Electron
Instala MO2 + script extender    Gerenciador próprio
Workarounds por jogo             Deploy nativo (TS + Python)
Steam + Heroic support           Steam + catálogo próprio
```

MO2 Linux Installer é um **instalador**, não um gerenciador. Makai é muito mais completo que ele. Ponto irrelevante para comparação.

---

## 2. Modularização — Nota: 8.5/10

### Pontos Fortes

| Aspecto | Nota | Evidência |
|---------|------|-----------|
| **Frontend hooks** | 10/10 | 14 hooks com responsabilidade única (máx 182L: useFomod, máx 178L: useProtonConfig) |
| **IPC handlers** | 9/10 | 13 arquivos separados por domínio, nenhum > 157L (exceto mod-proton.ts com 612L) |
| **SCSS** | 10/10 | 10 partials de ~100L cada, BEM nesting, sem vazamento |
| **Types** | 9/10 | 5 arquivos de tipos separados (mod, fomod, bridge, proton, index) |
| **Components** | 9/10 | Cada componente em seu diretório com SCSS colado |
| **Python Utils** | 7/10 | deploy/ tem 5 arquivos (765L), mas deploy/core.py tem 434L (deveria ser dividido) |
| **Bridge** | 6/10 | bridge.py tem 374L, resolve_fomod_selections() está no bridge em vez de no fomod_parser |

### Problemas Identificados

#### P1 — `mod-proton.ts` (612L) é muito grande
Comparado: Amethyst tem `prefix_manager.py` separado do `deploy_wine_dll.py`. Nosso `mod-proton.ts` tem 612L — maior que qualquer outro file de evento. Deveria ser dividido em:
- `mod-proton-detect.ts` (detecção de Steam, App ID, prefix)
- `mod-proton-setup.ts` (wineboot, DLL env)
- `mod-proton-repair.ts` (default_pfx auto-repair)

#### P2 — `mod-deploy-service.ts` (564L) monolítico
Amethyst divide deploy em 6 submódulos (deploy_shared 1.707L, mas isso é detalhado para uma única função). Nosso service tem 564L com todas as funções de deploy. Ideal dividir em:
- `mod-deploy-service.ts` → orquestração
- `mod-deploy-archive.ts` → extração
- `mod-deploy-core.ts` → symlink/filemap
- `mod-deploy-inventory.ts` → detecção de tipo

#### P3 — `bridge.py` (374L) com lógica de negócio
`resolve_fomod_selections()` (linhas 238-275) está no bridge.py quando deveria estar no `fomod_parser.py`. Amethyst separa `fomod_parser.py` (parser XML puro) de `fomod_installer.py` (engine de resolução). Nós temos o parser no Python e a engine de resolução tanto no bridge quanto no serviço TypeScript (`fomod-service.ts`).

#### P4 — `core.py` no deploy (434L) ainda grande
Deveria ser subdividido igual Amethyst faz: `deploy_shared.py`, `deploy_standard.py`.

#### P5 — Handler `mod-bridge.ts` tem stubs mortos
```
modBridgeDeploy, modBridgeRestore, modBridgeFomodParse, 
modBridgeFomodInstall, modBridgeLootSort
```
Todos registrados mas não chamados pelo renderer. O deploy real vai direto para o IPC `deployMods`.

---

## 3. CSS — Nota: 9.5/10

### Pontos Fortes
- SCSS BEM consistente (`.mod-manager__search`, `.mod-manager__mod-row--enabled`)
- 10 partials de no máximo 161 linhas
- Tema via CSS vars (`var(--accent, #6366f1)`)
- Sem vazamento: todos os seletores começam com `.mod-manager` ou `.fomod-dialog`
- SCSS único em `ModManager.scss` que importa todos os partials

### Problemas Menores

- **`_layout.scss` linha 29**: `background: #1a1a1a` hardcoded (não usa var(--sidebar-bg) ou similar)
- **`_modals.scss`**: `.mod-manager__conflicts` (linha 105) está no escopo global (não aninhado), mas usa prefixo `mod-manager__` então é seguro
- **`_fomod-misc.scss`**: `.fomod-dialog` não está aninhado em `.mod-manager` — intencional (é um overlay), mas foge do padrão BEM do resto

---

## 4. Bugs e Problemas Funcionais

### B1 — useDeploy.ts: deploy chama bridge em vez de IPC local
```typescript
// useDeploy.ts:15
const result = await window.electron.modBridgeDeploy(selectedGame, selectedProfile);
```
Mas os handlers locais (`mod-deploy.ts:18`) registram `deployMods`. O deploy vai para a bridge Python que executa `cmd_deploy()` no bridge.py. Funciona, mas é uma camada desnecessária (Python → subprocess → Python bridge → deploy). O correto seria chamar `window.electron.deployMods()` e usar o `ModDeployService` TypeScript (que é mais rápido e não depende do venv).

**Consertado na sessão passada mas ainda não refletido no código atual?** O `useDeploy.ts` ainda chama `modBridgeDeploy`.

### B2 — useFomod.ts: log diz "Aplicando FOMOD" mas vai para Python bridge
`handleInstall` em `useFomod.ts:128` chama `window.electron.installFomod()`, que no handler `mod-fomod.ts` chama `FomodService.install()` (TypeScript). O bridge.py também tem `cmd_fomod_install`. Existem duas implementações — a TypeScript e a Python. Verificar qual é usada de fato.

### B3 — useRightPanel.ts: caminho fixo do Amethyst
```typescript
const configDir = `${homeDir}/.config/AmethystModManager/profiles/${selectedGame || "default"}`;
```
Hardcoded para "AmethystModManager" — provavelmente um resquício do fork. Deveria ser `MakaiForge` ou configurável.

### B4 — ModManager.tsx: Proton config duplicado
O handler `handleGoProtonConfig` (linhas 70-90) é duplicado no modal GameConfig (linhas 309-327). O hook `useProtonConfig.ts` existe (178L) mas não é usado pelo ModManager — o código de proton config está inline.

### B5 — Bridge single-thread com race condition
`mod-bridge-service.ts` tem `pendingResolve` único — se dois comandos forem enviados antes da resposta, o segundo sobrescreve o primeiro. Deveria usar fila de requisições com IDs.

---

## 5. Dependências Python — Análise

### Makai Forge Python

| Utils Module | Lines | Status |
|-------------|-------|--------|
| `deploy/` | 765 | ✅ Funcional (5 arquivos) |
| `plugins.py` | 205 | ✅ Funcional |
| `fomod_parser.py` | ~150 | ✅ Funcional |
| `steam_finder.py` | 513 | ✅ Funcional |
| `prefix_manager.py` | 355 | ✅ Criado |
| `load_order.py` | ~300 | ✅ Criado |
| `plugin_parser.py` | ~200 | ✅ Criado |
| `eslifier.py` | ~100 | ✅ Criado |
| `bsa_invalidation.py` | ~100 | ✅ Criado |
| **Total** | **~2.688** | |

### Amethyst Python

| Utils Module | Lines | Status |
|-------------|-------|--------|
| `deploy_shared.py` | 1.707 | ✅ |
| `deploy_standard.py` | ~800 | ✅ |
| `deploy_root.py` | ~300 | ✅ |
| `deploy_game_root.py` | ~200 | ✅ |
| `deploy_custom_rules.py` | ~200 | ✅ |
| `deploy_wine_dll.py` | ~200 | ✅ |
| `fomod_installer.py` | ~600 | ✅ |
| `fomod_parser.py` | ~400 | ✅ |
| `plugins.py` | ~300 | ✅ |
| `modlist.py` | ~500 | ✅ |
| `loot_api.py` | ~800 | ✅ |
| `steam_finder.py` | ~300 | ✅ |
| `prefix_manager.py` | ~500 | ✅ |
| `filemap.py` | ~400 | ✅ |
| Outros 46 módulos | ~18.000 | ✅ |
| **Total** | **25.927** | |

### Análise

O Makai tem **~10%** do que Amethyst tem em Python. Mas isso não é necessariamente ruim:
- Amethyst tem 60 Utils files porque é Python puro (sem Electron)
- Makai tem TypeScript services que substituem parte do que Amethyst faz em Python
- Makai precisa de **mais alguns módulos** para ser completo:
  - `filemap.py` (mapa de arquivos deployed para dependências FOMOD)
  - `profile_state.py` (separadores, locks por perfil)
  - `modlist.py` (CRUD de modlist.txt)
  - `config_paths.py` (paths de config)
  - `cache_manager.py`

### Requisitos pip

```
Makai (requirements.txt):          Amethyst (requirements.txt):
- aiohttp>=3.14                    - aiohttp
- ijson>=3.3                       - Pillow
- (só 2 deps!)                     - customtkinter
                                   - requests
                                   - py7zr
                                   - rarfile
                                   - python-magic
                                   - send2trash
                                   - darkdetect
                                   - CTkMessagebox
                                   - CTkToolTip
                                   - (15+ deps)
```

Makai é muito mais leve em dependências Python porque:
1. Toda UI é Electron/React (não precisa de Tkinter)
2. Extração de arquivos usa `7z` do sistema (não py7zr/rarfile)
3. UI components são React (não precisa de CTk)

---

## 6. Features que os Concorrentes Têm e o Makai Não

### Críticas (deveriam ser implementadas)

| Feature | Amethyst | ModSanity | Makai | Impacto |
|---------|----------|-----------|-------|---------|
| **Plugin deps/load order visual** | ✅ | ✅ | ⚠️ Só Auto-Sort | Média — usuário não vê dependências |
| **File conflicts dashboard** | ✅ | ✅ | ⚠️ Só conflitos plugin | Média — ver arquivos conflitantes é crucial |
| **Profile export/import** | ✅ | ✅ | ❌ | Alta — sem backup de perfil |
| **Modlist import/export** | ✅ | ✅ (MO2) | ❌ | Alta — sem compatibilidade MO2 |
| **Rescan staging** | ✅ | ✅ | ❌ | Alta — se staging for modificado externamente |
| **External tools launcher** | ✅ (10+) | ✅ (8 tools) | ⚠️ (só genérico) | Alta — SSEEdit, FNIS, xEdit são essenciais |

### Desejáveis (nice to have)

| Feature | Amethyst | ModSanity | Makai |
|---------|----------|-----------|-------|
| BAIN installer | ✅ | ❌ | ❌ |
| SKSE override behavior | ❌ | ✅ | ❌ |
| Queue system | ✅ (downloads) | ✅ | ❌ |
| Collections (Nexus) | ✅ | ❌ | ❌ |
| Workshop integration | ✅ | ❌ | ❌ |
| Nexus catalog browser | ✅ | ✅ | ❌ |
| Doctor/diagnóstico | ❌ | ✅ | ❌ |

### Descartadas (por decisão)

| Feature | Motivo |
|---------|--------|
| Nexus API key | Pago — usuário não deve pagar |
| Collections Nexus | Depende de Nexus API key |
| Steam Workshop | API proprietária da Valve |

---

## 7. Recomendações Prioritárias

### Imediatas (bugs)
1. **`useDeploy.ts`**: trocar `modBridgeDeploy` por `deployMods` (IPC local, mais rápido, sem dependência Python)
2. **`useRightPanel.ts`**: trocar `.config/AmethystModManager` por caminho correto
3. **`ModManager.tsx`**: substituir inline proton config por `useProtonConfig` hook
4. **`mod-bridge-service.ts`**: adicionar fila de requisições com IDs para evitar race condition

### Curto Prazo (features faltantes)
5. **Modlist import/export** (formato JSON + MO2) — permite migração
6. **Rescan staging** — escaneia diretório staging por mods novos
7. **Profile export/import** — backup completo do perfil
8. **File conflicts dashboard** — ver todos os conflitos de arquivo (não só plugins)

### Médio Prazo (refatoração)
9. **Dividir `mod-proton.ts`** (612L) em 3 arquivos
10. **Dividir `mod-deploy-service.ts`** (564L) em submódulos
11. **Mover `resolve_fomod_selections()`** do bridge.py para fomod_parser.py
12. **Remover handlers IPC mortos** (14 handlers identificados)

### Longo Prazo (features avançadas)
13. **External tools launcher** com suporte a SSEEdit, FNIS, Bodyslide, DynDOLOD
14. **SKSE override behavior** — detectar e sempre copiar arquivos SKSE
15. **Plugin dependency graph** — visualização de dependências entre plugins
16. **BAIN installer** (Wrye Bash)

---

## 8. Métricas do Mod Manager

| Métrica | Valor |
|---------|-------|
| Arquivos TS/TSX | 412 |
| Linhas TS/TSX | 4.068 |
| Arquivos SCSS | ~40 (partials) |
| Linhas SCSS | 3.234 |
| Hooks React | 14 |
| IPC Handlers | 13 (registrados, 22 se contar mortos) |
| Componentes | 6 (ModListPanel, RightPanel, TopBar, FomodDialog, StatusBar, Modals) |
| Modais | 7 (GameConfig, AddProfile, Conflicts, DeployConfirm, Preview, Readme, Backup) |
| Python Utils | ~8 módulos (2.688L) |
| Dependências pip | 2 |
| Dependências npm (mod manager) | react, @tanstack/react-virtual, @primer/octicons-react |

---

## 9. Conclusão

O Mod Manager do Makai Forge está **excelente** para um app Electron/React. A modularização é superior à do Amethyst (que tem 68 arquivos GUI monolíticos). O SCSS é limpo e consistente. Os hooks são bem separados.

**Pontos de atenção:**
- O deploy Python bridge cria latência desnecessária (duas camadas de subprocess: Electron → Python bridge → Python deploy)
- Faltam features de "qualidade de vida" (import/export, rescan, profile backup)
- mod-proton.ts e mod-deploy-service.ts precisam de split

**Comparado aos concorrentes:**
- Makai tem **melhor UI/UX** que todos (virtual scrolling, drag-and-drop, split pane, preview)
- Makai tem **pior backend Python** que Amethyst (10% do tamanho, menos features)
- Makai tem **features equivalentes** a ModSanity (deploy, FOMOD, LOOT, plugins)
- Makai é **muito superior** ao MO2 Linux Installer (que é só um instalador)

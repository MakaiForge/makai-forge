# Auditoria: ProtonTools

> Data: 2026-08-18
> Escopo: `app/ProtonTools/` (main/services, main/events, renderer)

---

## 1. Arquitetura

```
Renderer (UI)
  ├─ pages/proton-tools/ → Página principal (4 tabs)
  ├─ components/ → ProtonDBBadge, ProtonPathPicker
  └─ hooks/useProtonTools.ts → Estado + ações

Main Process
  ├─ services/
  │    ├─ tools.ts → 20+ ProtonTools definidos (valve, GE, CachyOS, etc)
  │    ├─ db.ts → Lê fork_catalog.db (SQLite)
  │    ├─ downloader.ts → Download via axios (GitHub/GitLab/Forgejo)
  │    ├─ extractor.ts → Extração via tar/unzip (exec)
  │    ├─ installer.ts → Gerencia diretórios instalados
  │    └─ index.ts → Orquestrador (fila de downloads)
  └─ events/
       ├─ install-game-with-proton.ts → Download sob demanda
       ├─ recommend-proton.ts → Recomendação via Python RPC
       └─ get-fork-catalog.ts → Catálogo do DB
```

---

## 2. Fluxo: Download + Extração + Armazenamento

```
1. Usuário clica "Baixar" em um Proton
   │
2. useProtonTools.handleDownload()
   └─ api.downloadProtonTool(toolId, release)
       │
3. services/index.ts → downloadTool()
   └─ Fila serial (downloadQueue)
       │
4. downloadToolInternal()
   │
   ├─ Verifica se já existe: fs.existsSync(expectedPath/proton)
   │    └─ Se existe → retorna path (skip download)
   │
   ├─ Fase 1: DOWNLOADER (0-60%)
   │    └─ downloader.downloadFile(tool, release, categoryDir)
   │         ├─ getDownloadUrl() → URL do asset/tarball
   │         ├─ axios.get(url, { responseType: "stream" })
   │         ├─ pipeline(response.data, writer) → salva em disco
   │         └─ Retorna { filePath: "/path/to/file.tar.gz" }
   │
   ├─ Fase 2: EXTRACTOR (60-80%)
   │    └─ extractor.extractArchive(filePath, categoryDir, dirName)
   │         ├─ .tar.xz → exec("tar -xJf ...")
   │         ├─ .tar.gz → exec("tar -xzf ...")
   │         ├─ .zip → exec("unzip -o ...")
   │         ├─ findNewDirectory() → detecta pasta criada
   │         └─ Retorna { extractPath: "/path/to/extracted" }
   │
   ├─ Fase 3: VERIFICAÇÃO (80-100%)
   │    ├─ getInstalledTools() → compara antes/depois
   │    ├─ renameDirToExpected() → renomeia se necessário
   │    └─ Retorna path final do Proton instalado
   │
   └─ Armazenamento:
        ~/.config/makai-forger/compat-tools/
        ├─ compatibilitytools.d/     (Proton: valve, GE, etc)
        ├─ runners/wine/             (Wine: Kron4ek, etc)
        ├─ runtime/dxvk/             (DXVK)
        └─ runtime/vkd3d/            (VKD3D-Proton)
```

---

## 3. Problemas Identificados

### 🔴 Críticos

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 1 | **`extractor` deleta arquivo após extração** | `extractor.ts:58,118` | `fs.unlinkSync(filePath)` deleta o .tar.gz/.zip após extrair. Se o usuário quiser reinstalar, precisa baixar de novo. Não tem opção de manter. |
| 2 | **`extractor` usa `exec()` sem timeout** | `extractor.ts:46,106` | `exec("tar -x...")` sem timeout. Arquivos .tar.xz grandes (>5GB) podem travar o processo indefinidamente. |
| 3 | **`downloader` não valida espaço em disco** | `downloader.ts` | Não verifica se há espaço livre antes de baixar. Proton-GE tem ~1.5GB. Se disco cheio, arquivo fica corrompido silenciosamente. |
| 4 | **`downloadToolInternal` falha silenciosamente** | `services/index.ts:140-150` | Se `newTool` não é encontrado após extração, retorna null sem cleanup. Arquivo parcialmente extraído fica no disco. |
| 5 | **`isInternalFolder` muito agressivo** | `installer.ts:45-60` | `IGNORE_PATTERNS` inclui "bin", "lib", "share", "data". Protons extraídos TÊM pastas "bin" e "lib". Se o nome da pasta do Proton contiver essas strings, é ignorado. |

### 🟡 Médios

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 6 | **`getForkCatalogFromDb` abre DB sem fechar em erro** | `db.ts:25-30` | `new Database(dbPath, { readonly: true })` — se erro entre open e close, DB fica leak. Deveria usar try/finally. |
| 7 | **`isToolInstalled` comparação frágil** | `installer.ts:75-85` | `installedVersion.includes(searchVersion)` pode dar match falso. Ex: "proton-9" bate com "proton-9.0-1" E com "proton-19". |
| 8 | **`findReleaseByFork` match muito permissivo** | `install-game-with-proton.ts:40-50` | `tag.includes(version)` pode match errado. Ex: version "1.0" matcha com tag "GE-Proton1.0-1" E "Proton-21.0". |
| 9 | **`downloadQueue` não tem limite** | `services/index.ts` | Fila ilimitada. Se usuário clicar "Baixar" 20 vezes, tudo entra na fila. Sem feedback de queue position. |
| 10 | **`formatDirName` prefixo conhecido hardcoded** | `tools.ts:180-195` | `knownPrefixes` é lista fixa. Novos forks não são reconhecidos. |
| 11 | **`console.error` em produção** | `useProtonTools.ts:42,96` | `console.error("Failed to load...")` — deveria usar logger. |
| 12 | **`proton-api.ts` sem error handling** | `proton-api.ts` | Funções retornam `Promise<unknown>` sem tratamento de erro. |
| 13 | **`archMatch` não trata i686 corretamente** | `downloader.ts:11` | `i686` (32-bit) retorna true para `x86_64` (64-bit). Um Proton 32-bit seria baixado em sistema 64-bit. |

### 🟢 Menores

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 14 | **`getTools()` assíncrono desnecessário** | `services/index.ts:28` | `async getTools()` retorna dado síncrono. |
| 15 | **`db.ts` usa `require()` dinâmico** | `db.ts:27` | `require("better-sqlite3")` em vez de import estático. |
| 16 | **`handleRemove` usa `confirm()` nativo** | `useProtonTools.ts:140` | `confirm()` é blocking e não segue o design system. |
| 17 | **`proton-info-modal` não traduz features** | `translations.ts` | Features ficam em inglês mesmo com i18n. |

---

## 4. Fluxo de Decisão: URL de Download

```
tool.type
  │
  ├─ "github" → endpoint: api.github.com/repos/.../releases
  │    ├─ release.assets (filtra por arch)
  │    ├─ release.tarball_url
  │    └─ constructGithubTarballUrl() (fallback)
  │
  ├─ "github-action" → endpoint: api.github.com/repos/.../actions/runs
  │    └─ getGithubActionArtifactUrl() → artifacts[0].archive_download_url
  │
  ├─ "forgejo" → endpoint: dawn.wine/api/v1/repos/.../releases
  │    └─ Mesma lógica de assets
  │
  └─ "gitlab" → endpoint: gitlab.com/api/v4/projects/.../releases
       └─ Mesma lógica de assets

Filtros de asset:
  1. Deve terminar em .tar.gz, .zip, ou .tar.xz
  2. Deve bater com arch (x86_64/arm64)
  3. Prioriza: arch explícito > genérico > qualquer um
```

---

## 5. Mapa de Chamadas

```
Renderer                              Main Process
────────                              ────────────
useProtonTools
  │
  ├─ handleDownload(toolId, release)
  │    └─ api.downloadProtonTool() ──→ downloadProtonTool event
  │                                      │
  │                                      └─ downloadTool(options)
  │                                           │
  │                                           ├─ downloadToolInternal()
  │                                           │    ├─ downloader.downloadFile()
  │                                           │    │    └─ axios.get() → pipeline()
  │                                           │    ├─ extractor.extractArchive()
  │                                           │    │    └─ exec("tar -x...") / exec("unzip")
  │                                           │    └─ renameDirToExpected()
  │                                           │
  │                                           └─ Retorna path
  │
  ├─ loadInstalled()
  │    └─ api.getInstalledProtonTools() → getInstalledTools
  │         └─ installer.getInstalledTools()
  │              └─ readdirSync() → findToolByFolder()
  │
  ├─ handleRemove(toolId, path)
  │    └─ api.removeProtonTool() ────→ removeProtonTool event
  │                                      └─ installer.removeTool()
  │                                           └─ fs.rmSync()
  │
  └─ handleSelectVersion(toolId, release)
       └─ loadReleases(toolId) ──────→ getProtonReleases event
                                        └─ getReleasesByForkId()
                                             └─ SQLite query
```

---

## 6. Store Keys

| Key | Conteúdo |
|-----|----------|
| `~/.config/makai-forger/compat-tools/` | Diretório raiz de todos os Protons |
| `~/.config/makai-forger/compat-tools/compatibilitytools.d/` | Protons (valve, GE, CachyOS, etc) |
| `~/.config/makai-forger/compat-tools/runners/wine/` | Wine builds |
| `~/.config/makai-forger/compat-tools/runtime/dxvk/` | DXVK |
| `~/.config/makai-forger/compat-tools/runtime/vkd3d/` | VKD3D-Proton |
| `app/_data/fork_catalog.db` | Catálogo SQLite de forks/releases |

---

## 7. Recomendações

### Prioridade Alta

1. **Adicionar timeout no `extractor`** — `exec()` com timeout de 10 minutos
2. **Validar espaço em disco** antes do download
3. **Corrigir `isInternalFolder`** — não ignorar pastas "bin"/"lib" se estão dentro de um Proton
4. **Cleanup em falha** — remover arquivos parciais se extração falhar

### Prioridade Média

5. **Usar try/finally no `db.ts`** — garantir `db.close()`
6. **Corrigir `archMatch`** — i686 não deveria bater com x86_64
7. **Adicionar limite à fila** — max 3 downloads simultâneos
8. **Tornar `isToolInstalled` mais preciso** — usar comparação semântica de versão

### Prioridade Baixa

9. Remover `console.error` em produção
10. Tipar `proton-api.ts` corretamente
11. Usar `confirm` do design system

# Prefix — Documentacao Completa

> Gestao de prefixos Wine/Proton para jogos Linux. Caminho base: `tools/prefix/`

---

## Estrutura de Diretorios

```
prefix/
├── index.ts                          # Barrel (re-exports de tudo)
├── types.ts                          # Tipos compartilhados
├── activity-logger.ts                # Logger de auditoria JSON-line
├── activity.log                      # Log de atividades (gerado)
├── umu-run                           # Binario/script umu-run
│
├── core/
│   ├── init.ts                       # Criacao de prefix (4 estrategias)
│   ├── wine-prefix.ts                # Classe Wine: helpers de resolucao de caminho
│   ├── steam-paths.ts                # Descoberta de filesystem Steam
│   ├── venv.ts                       # Resolucao de caminho venv Python
│   ├── clear.ts                      # Deletacao/cleanup de compatdata
│   ├── validate.ts                   # Validacao + normalizacao de prefix
│   ├── bethesda-registry.ts          # Semeacao de registry Wine para Bethesda
│   └── dll-overrides.ts              # Injecao de DLL overrides em user.reg
│
├── events/
│   ├── ensure-game-prefix.ts         # IPC: ensureGamePrefix
│   ├── clear-steam-prefix.ts         # IPC: clearSteamPrefix
│   ├── delete-game-prefix.ts         # IPC: deleteGamePrefix / deleteGameWithPrefix
│   ├── run-wine-tool.ts              # IPC: runWineTool
│   ├── select-game-wine-prefix.ts    # IPC: selectGameWinePrefix / getDefaultWinePrefixSelectionPath
│   └── setup-proton-environment.ts   # IPC: preparePrefix / setupProtonEnvironment
│
├── wine_prefix/
│   ├── PrefixSetupModal.tsx          # React UI: modal de progresso durante setup
│   └── PrefixSetupModal.scss         # Estilos
│
└── python/
    ├── cli.py                        # CLI Python para operacoes de prefix
    └── prefix/
        ├── __init__.py               # Package init (re-exports API publica)
        ├── core.py                   # Core: create/delete/clean/validate (Python)
        ├── makaitricks.py            # Installer de winetricks/DLL verbs
        └── runner.py                 # Executor de comandos Proton
```

---

## Arvore Genealogica de Execucao

### FLUXO 1: ensureGamePrefix (IPC)

```
[Renderer] ipcRenderer.invoke("ensureGamePrefix", ...)
  → events/ensure-game-prefix.ts
    → core/init.ts: ensureGamePrefix()
      │
      ├── 1. getSteamGameProton()          ← @main/services/steam-config-vdf
      ├── 2. setSteamGameProton()           ← @main/services/steam-config-vdf
      ├── 3. findProtonPath()               ← core/steam-paths.ts
      │     └── scan 3 dirs compatibilitytools.d/
      │
      ├── 4. clearSteamPrefixCore()         ← core/init.ts (interno)
      │     ├── getSteamLocation()          ← @main/services/steam
      │     ├── parseLibraryFolders()       ← core/steam-paths.ts
      │     ├── clearCompatData()           ← core/clear.ts
      │     └── ensureCompatData()          ← core/clear.ts
      │
      ├── 5. createPrefix()                 ← core/init.ts
      │     ├── normalizePrefixPath()       ← core/validate.ts
      │     ├── findUmuBinary()
      │     ├── findProtonWineBinary()
      │     ├── logOperation()              ← activity-logger.ts
      │     └── 4 estrategias:
      │         ├── (1) umu-run wineboot
      │         ├── (2) wineboot do Proton dist/files
      │         ├── (3) proton wineboot
      │         └── (4) proton run wineboot
      │
      └── 6. findSteamClientPath()          ← core/steam-paths.ts
```

### FLUXO 2: setupProtonEnvironment (IPC — MAIS COMPLEXO)

```
[Renderer] ipcRenderer.invoke("setupProtonEnvironment", ...)
  → events/setup-proton-environment.ts: setupProtonEnvironment()
    │
    ├── 1. getSteamLocation()
    ├── 2. Parsing appmanifest (inline — duplica parseLibraryFolders)
    ├── 3. clearSteamPrefixCore()           ← core/init.ts
    │     ├── clearCompatData()             ← core/clear.ts
    │     └── ensureCompatData()            ← core/clear.ts
    │
    ├── 4. Verificar binario Proton
    ├── 5. setSteamGameProton()             ← @main/services/steam-config-vdf
    │
    ├── 6. normalizePrefixPath()            ← core/validate.ts
    │
    ├── 7. getUmuBinaryPath()               ← @provision/prefix-setup
    │
    ├── 8. createPrefix()                   ← core/init.ts
    │     └── 4 estrategias (umu → wineboot → proton wineboot → proton run)
    │
    ├── 9. getGameModule() / listKnownGames()  ← @games/registry
    │
    ├── 10. applyWineDllOverrides()         ← core/dll-overrides.ts
    │      └── Grava em user.reg [Software\\Wine\\DllOverrides]
    │
    ├── 11. applyWineDllOverrides() (catalogo game-dlls.json)
    │
    ├── 12. ProtonRecommendationService.runMakaitricks()
    │      └── Instala deps via winetricks
    │
    ├── 13. seedBethesdaRegistry()          ← core/bethesda-registry.ts
    │      └── Grava Installed Path em system.reg
    │
    └── 14. Verificacao final
```

### FLUXO 3: clearSteamPrefix (IPC)

```
[Renderer] ipcRenderer.invoke("clearSteamPrefix", appId, protonName?)
  → events/clear-steam-prefix.ts
    ├── getSteamLocation()
    ├── parseLibraryFolders()               ← core/steam-paths.ts
    ├── clearCompatData()                   ← core/clear.ts
    ├── ensureCompatData()                  ← core/clear.ts
    ├── findProtonPath()                    ← core/steam-paths.ts
    ├── findSteamClientPath()               ← core/steam-paths.ts
    └── createPrefix()                      ← core/init.ts
```

### FLUXO 4: deleteGamePrefix / deleteGameWithPrefix (IPC)

```
[Renderer] ipcRenderer.invoke("deleteGamePrefix", shop, objectId)
  → events/delete-game-prefix.ts
    → core/clear.ts: deleteGamePrefix()
      └── Le do gamesStore
      └── fs.rmSync (deleta do disco)
      └── Grava null no store

[Renderer] ipcRenderer.invoke("deleteGameWithPrefix", shop, objectId)
  → events/delete-game-prefix.ts
    ├── deleteGamePrefix()
    └── deleteGameFromDatabase()
```

### FLUXO 5: runWineTool (IPC)

```
[Renderer] ipcRenderer.invoke("runWineTool", shop, objectId, tool)
  → events/run-wine-tool.ts
    ├── (se "winelog") getVenvPythonPath() → spawn Python GUI
    └── (senao) createWineToolRunner()
```

### FLUXO 6: selectGameWinePrefix (IPC)

```
[Renderer] ipcRenderer.invoke("selectGameWinePrefix", shop, objectId, path)
  → events/select-game-wine-prefix.ts
    ├── Wine.validatePrefix()               ← core/wine-prefix.ts
    └── Salva no gamesStore + JSON

[Renderer] ipcRenderer.invoke("getDefaultWinePrefixSelectionPath")
  → Wine.getDefaultPrefixPath()
```

### FLUXO 7: Python CLI

```
cli.py create-prefix
  → prefix.core.create_prefix()
    ├── resolve_prefix_path()
    ├── ensure_proton_valid()
    ├── prefix_exists()
    ├── 4 estrategias:
    │   ├── (1) system wineboot
    │   ├── (2) umu-run
    │   ├── (3) direct wineboot
    │   └── (4) proton wineboot / proton run
    ├── _run_command()          ← subprocess wrapper
    ├── build_env()
    ├── ensure_prefix_markers()
    ├── resolve_actual_prefix()
    └── makaitricks.install_recommended_dlls()  [se auto_dlls]
         └── _check_dll_installed()
         └── run_makaitricks()
              └── _ensure_makaitricks()
                   └── _check_makaitricks_update()  [auto-update GitHub]

cli.py install-makaitricks
  → prefix.makaitricks.install_recommended_dlls()
    ├── _check_dll_installed()
    └── run_makaitricks()

cli.py run
  → prefix.runner.run_proton_command_for_game()
    └── subprocess.run()

cli.py validate-prefix
  → prefix.core.prefix_exists()
  → prefix.core.resolve_actual_prefix()
    └── prefix.core.is_prefix_initialized()
```

---

## Todas as Funcoes Exportadas por Arquivo

### core/init.ts
| Funcao | Assinatura | Descricao |
|--------|-----------|-----------|
| `createPrefix` | `(options: CreatePrefixOptions) => Promise<CreatePrefixResult>` | CORE: 4 estrategias de criacao |
| `initPrefix` | `(protonBinary, compatDataPath, steamClientPath) => Promise<boolean>` | Wrapper legado |
| `initPrefixViaUmu` | `(umuBinary, protonPath, gameId, winePrefixPath, onLog?) => Promise<boolean>` | Wrapper legado |
| `checkAndCreateWinePrefix` | `(winePrefixPath, wineBinaryPath) => Promise<boolean>` | Wrapper legado |
| `ensureGamePrefix` | `(options: EnsureGamePrefixOptions) => Promise<EnsureGamePrefixResult>` | ORQUESTRADOR ALTO NIVEL |
| `clearSteamPrefixCore` | `(appId: string) => Promise<string \| null>` | Limpa compatdata |

### core/steam-paths.ts
| Funcao | Assinatura | Descricao |
|--------|-----------|-----------|
| `parseLibraryFolders` | `(steamPath: string) => string[]` | Parse libraryfolders.vdf |
| `findAllSteamLibraries` | `() => string[]` | Scan 4 VDF + 5 defaults |
| `findProtonPath` | `(protonName: string) => string \| null` | Busca Proton em 3 roots |
| `findSteamClientPath` | `() => string` | Primeiro path Steam valido |
| `findSteamAppPath` | `(appId: string) => { gamePath, libraryPath } \| null` | Envia jogo via appmanifest |
| `findCompatData` | `(appId: string) => string \| null` | Encontra compatdata/pfx/ |

### core/clear.ts
| Funcao | Assinatura | Descricao |
|--------|-----------|-----------|
| `clearCompatData` | `(compatDir: string) => boolean` | Remove conteudo do compatdata |
| `ensureCompatData` | `(compatDir: string) => void` | Cria diretorio compatdata |
| `deleteGamePrefix` | `(shop, objectId) => Promise<void>` | Deleta prefix do store e disco |

### core/validate.ts
| Funcao | Assinatura | Descricao |
|--------|-----------|-----------|
| `normalizePrefixPath` | `(p: string) => string` | Expande ~/ e resolve ./.. |
| `validatePrefix` | `(prefixPath: string) => ValidationResult` | Verifica drive_c, dosdevices, .reg |
| `ensurePrefixDir` | `(prefixPath: string) => string \| null` | Retorna pfx existente ou cria minimo |

### core/wine-prefix.ts (classe estatica Wine)
| Metodo | Assinatura | Descricao |
|--------|-----------|-----------|
| `getProtonForgerPrefixPath` | `(gameTitle: string) => string` | ~/Games/MakaiForger/title |
| `getDefaultPrefixPath` | `() => string \| null` | userData/wine-prefixes |
| `getLegacyDefaultPrefixPath` | `() => string \| null` | userData/wine-prefix (legado) |
| `getDefaultPrefixPathForGame` | `(objectId: string) => string \| null` | defaultPath/objectId |
| `getEffectivePrefixPath` | `(winePrefixPath?, objectId?, gameTitle?) => string \| null` | Cascata de prioridade |
| `validatePrefix` | `(winePrefixPath: string) => boolean` | Verifica se e diretorio |

### core/dll-overrides.ts
| Funcao | Assinatura | Descricao |
|--------|-----------|-----------|
| `applyWineDllOverrides` | `(prefixPath, overrides: DllOverridesMap) => void` | Grava DLL overrides em user.reg |
| `applyGameDllOverrides` | `(gameId, gamePath, prefixPath, getWineDllOverrides?) => void` | Usa GameModule + delega |
| `verifyDllOverrides` | `(prefixPath, overrides) => VerifyDllResult` | Verifica overrides presentes |

### core/bethesda-registry.ts
| Funcao | Assinatura | Descricao |
|--------|-----------|-----------|
| `seedBethesdaRegistry` | `(prefixPath, gamePath, registryName) => boolean` | Grava Installed Path em system.reg |
| `verifyBethesdaRegistry` | `(prefixPath, registryName, gamePath?) => boolean` | Verifica registry |

### core/venv.ts
| Funcao | Assinatura | Descricao |
|--------|-----------|-----------|
| `getVenvPythonPath` | `() => string \| null` | Caminho python3 do venv |
| `getPrefixPythonDir` | `() => string` | Caminho tools/prefix/python/ |

### activity-logger.ts
| Funcao | Assinatura | Descricao |
|--------|-----------|-----------|
| `logOperation` | `(operation, status, details?) => void` | Log lifecycle de operacao |
| `logCall` | `(caller, functionName, args, result?, duration_ms?) => void` | Log chamada com args/result |
| `logError` | `(operation, error, details?) => void` | Log erro |

### python/prefix/core.py
| Funcao | Assinatura | Descricao |
|--------|-----------|-----------|
| `resolve_prefix_path` | `(game_id, prefix_path?) => str` | Resolve caminho do prefix |
| `ensure_proton_valid` | `(proton_path) => bool` | Verifica proton existe |
| `prefix_exists` | `(prefix_path) => bool` | Verifica user.reg + system.reg |
| `is_prefix_initialized` | `(prefix_path) => bool` | Verifica system32 |
| `resolve_actual_prefix` | `(prefix_path) => str` | Retorna root ou subpasta pfx/ |
| `ensure_prefix_markers` | `(prefix_path) => void` | Cria .reg se faltam |
| `build_env` | `(prefix_path, compat_data_path?) => dict` | Constroi env dict |
| `create_prefix` | `(game_id, proton_path, ...) => dict` | Mirror Python do TS createPrefix |
| `delete_prefix` | `(prefix_path) => bool` | shutil.rmtree |
| `clean_prefix` | `(prefix_path) => bool` | Remove + recria |

### python/prefix/makaitricks.py
| Funcao | Assinatura | Descricao |
|--------|-----------|-----------|
| `run_makaitricks` | `(proton_path, prefix_path, verb, makaitricks_bin?) => (bool, str)` | Roda verb winetricks |
| `install_recommended_dlls` | `(game_id, prefix_path, proton_path, ...) => dict` | Instala lista de verbs |
| `run_makaitricks_verbs` | `(prefix_path, proton_path, verbs, makaitricks_bin?) => dict` | Alias |

### python/prefix/runner.py
| Funcao | Assinatura | Descricao |
|--------|-----------|-----------|
| `run_proton_command_for_game` | `(proton_path, command, use_umu?, env_override?) => int \| None` | Roda comando dentro do Proton |

---

## Constantes

### BETHESDA_COMMON_DLL_OVERRIDES
```typescript
{
  winmm: "native,builtin",
  version: "native,builtin",
  d3dcompiler_47: "native"
}
```

### MODERN_DIRECTX_DEPS
```typescript
["vcredist", "d3dcompiler_47"]
```

---

## Arquitetura em 3 Camadas

```
┌─────────────────────────────────────────────────┐
│  CAMADA ALTA (Orquestracao)                      │
│  ensureGamePrefix()                              │
│  setupProtonEnvironment()                        │
│  clearSteamPrefix()                              │
├─────────────────────────────────────────────────┤
│  CAMADA MEDIA (Ciclo de Vida)                    │
│  createPrefix()    clearCompatData()             │
│  dll-overrides     bethesda-registry             │
├─────────────────────────────────────────────────┤
│  CAMADA BAIXA (Filesystem)                       │
│  steam-paths.ts    validate.ts                   │
│  wine-prefix.ts    venv.ts                       │
└─────────────────────────────────────────────────┘
```

---

## Dual Implementation (TS + Python)

`createPrefix()` existe em **duas implementacoes**:
- `core/init.ts` — TypeScript, async, spawned processes
- `python/prefix/core.py` — Python, sincrono, subprocess

Ambas implementam as mesmas 4 estrategias mas sao entry points alternativos, nao conectados diretamente.

---

## Cross-Module Import Map

```
core/init.ts ──────imports──────► core/steam-paths.ts
  │                              core/clear.ts
  │                              core/validate.ts
  │                              activity-logger.ts
  │                              @main/services (logger, Umu)
  │                              @main/services/steam-config-vdf (dynamic)
  │                              @main/services/steam (dynamic)
  │                              @provision/prefix-setup (dynamic)
  │
core/dll-overrides.ts imports ──► core/validate.ts
  │                              activity-logger.ts
  │
events/*.ts ───────all import───► activity-logger.ts
  │                              @main/events/register-event
  │
events/setup-proton-environment.ts imports (dynamic):
  │  @prefix/core/dll-overrides
  │  @prefix/core/init
  │  @prefix/core/bethesda-registry
  │  @games/registry
  │  @main/services/steam
  │  @main/services/steam-config-vdf
  │  @provision/proton-recommendation
  │  @provision/prefix-setup
```

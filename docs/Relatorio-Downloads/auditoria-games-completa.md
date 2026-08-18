# Auditoria Completa: Módulo Games

> Data: 2026-08-18
> Escopo: `app/Games/` (components, hooks, services, events, pages, AddGame)

---

## 1. Visão Geral do Módulo

O módulo Games é o coração do Makai Forge — gerencia o ciclo de vida completo de um jogo:
**Detecção → Instalação → Configuração → Execução → Monitoramento → Remoção**

### Arquitetura em Camadas

```
┌──────────────────────────────────────────────────────────────────┐
│  RENDERER (React)                                                │
│                                                                  │
│  Pages                                                           │
│  ├─ games/ → hooks/use-games.ts → GameBar, Cards, Toolbar       │
│  ├─ game-launcher/ → Fluxo de 8 steps                           │
│  └─ game-details/ → Página de detalhes                          │
│                                                                  │
│  Services (UI)                                                   │
│  ├─ game-bar/ → WineToolsMenu, ações                            │
│  └─ play/ → 8 steps (scan → proton → prefix → launch)           │
│                                                                  │
├─────────────── IPC Bridge (window.electron) ─────────────────────┤
│                                                                  │
│  MAIN PROCESS                                                    │
│                                                                  │
│  Events (library/) → 50+ handlers IPC                            │
│  ├─ scan-installed-games.ts → Detecção automática               │
│  ├─ install-library.ts → Winetricks components                  │
│  ├─ add-custom-game-to-library.ts → Jogos custom               │
│  ├─ delete-game-with-prefix.ts → Remoção                        │
│  └─ ... (50+ handlers)                                          │
│                                                                  │
│  Services                                                        │
│  ├─ process-watcher.ts → Monitoramento de processos             │
│  ├─ game-executables.ts → Executáveis conhecidos                │
│  ├─ game-log-manager.ts → Buffer de logs                        │
│  └─ delete-game.ts → Lógica de deleção                          │
│                                                                  │
│  Python Backend (game_install_core/)                             │
│  ├─ detect.py → Detecta instalador vs portátil                  │
│  ├─ copy.py → Cópia verificada SHA256                           │
│  ├─ scan.py → Scan por executáveis no prefixo                   │
│  ├─ snapshot.py → Snapshot antes/depois de instalador           │
│  ├─ runner.py → Executa instalador via umu-run                  │
│  ├─ orchestrator.py → Fluxo completo                            │
│  └─ server.py → RPC stdio para CompactFlow                      │
│                                                                  │
│  Store (levelDB)                                                 │
│  ├─ gamesStore → Dados dos jogos                                │
│  ├─ gamesShopAssetsStore → Assets (capas, logos)                │
│  └─ gamesPlaytime → Map de sessões ativas                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Fluxos Mapeados

### 2.1 Fluxo: Detecção de Jogos Instalados

```
scan-installed-games.ts
  │
  ├─ 1. Busca todos os jogos da gamesStore (shop === "steam", !isDeleted)
  │
  ├─ 2. Filtra jogos SEM executablePath
  │
  ├─ 3. Para cada jogo:
  │    ├─ GameExecutables.getExecutablesForGame(objectId) → nomes conhecidos
  │    └─ searchInDirectories() → procura em:
  │         ├─ C:\Games
  │         ├─ D:\Games
  │         ├─ C:\Program Files (x86)\Steam\steamapps\common
  │         ├─ C:\Program Files\Steam\steamapps\common
  │         └─ C:\Program Files (x86)\DODI-Repacks
  │
  ├─ 4. Se encontrado → salva executablePath no gamesStore
  │
  └─ 5. Publica notificação SCAN_GAMES_COMPLETE
```

**⚠️ Problemas:**
- SCAN_DIRECTORIES é hardcoded com paths Windows — não funciona no Linux sem Proton
- Apenas procura jogos Steam — ignora jogos custom/locais
- `findExecutableInFolder` usa `recursive: true` que pode ser lento em pastas grandes

### 2.2 Fluxo: Instalação de Jogo (Portátil)

```
install-game.ts (TypeScript) / orchestrator.py (Python)
  │
  ├─ 1. detect_installer_type(source_path)
  │    └─ Pasta com .exe que NÃO é setup/install → portátil
  │
  ├─ 2. copy_to_prefix(source, prefix)
  │    ├─ SHA256 pré-cópia (0-5%)
  │    ├─ Cópia em lotes para .tmp-copy (5-90%)
  │    ├─ Contagem pós-cópia
  │    ├─ SHA256 pós-cópia (90-100%)
  │    └─ Troca atômica (rename)
  │
  ├─ 3. scan_prefix_for_exes(prefix, game_folder_name)
  │    ├─ Scan drive_c/ até depth 6
  │    ├─ Exclui dirs do sistema (windows, system32, etc)
  │    ├─ Exclui exe de redist (unins*, vcredist*, etc)
  │    ├─ Classifica: game, launcher, setup, redist, unknown
  │    └─ Retorna top 10 por tamanho
  │
  └─ 4. Retorna candidates para seleção do usuário
```

### 2.3 Fluxo: Instalação de Jogo (Instalador)

```
install-game.ts / orchestrator.py
  │
  ├─ 1. detect_installer_type(source_path)
  │    └─ Arquivo .exe/.msi OU pasta com setup.exe → instalador
  │
  ├─ 2. snapshot_prefix(prefix) → lista todos os arquivos em drive_c/
  │
  ├─ 3. run_installer_in_container(installer, proton, prefix, game_path)
  │    ├─ Env limpo: PROTON_NO_ESYNC=1, PROTON_DISABLE_DXVK=1, etc
  │    ├─ Executa via umu-run
  │    └─ Aguarda exit code
  │
  ├─ 4. snapshot_prefix(prefix) → lista arquivos novos
  │
  ├─ 5. find_new_executables(before, after)
  │    ├─ Compara snapshots
  │    ├─ Filtra .exe novos (não Wine-internos)
  │    └─ Prioriza exe em pastas novas
  │
  ├─ 6. Se não encontrou → fallback: copy_to_prefix + scan
  │
  └─ 7. Retorna candidates para seleção do usuário
```

### 2.4 Fluxo: Jogar (GameBar → Play)

```
use-games.ts → playGame(game)
  │
  ├─ 1. window.electron.modPlayGame(gameId)
  │
  └─ game-launcher/play/play-game.ts → 8 Steps:
       │
       ├─ Step 0: scanEnvironment()
       │    ├─ Valida gamePath existe
       │    ├─ Valida prefix existe
       │    └─ Valida proton existe
       │
       ├─ Step 2: ensureProton()
       │    ├─ Se já existe → usa direto
       │    └─ Se não → busca/baixa proton
       │
       ├─ Step 3: ensurePrefix()
       │    ├─ Se já válido → usa direto
       │    └─ Se não → cria com umu-run wineboot
       │
       ├─ Step 3b: bridgePrefixToSteam()
       │    └─ Conecta prefix ao Steam (se steamAppId)
       │
       ├─ Step 4: applyGameConfigs()
       │    ├─ DLL Overrides
       │    ├─ Makaitricks
       │    ├─ Bethesda Registry
       │    └─ Verify (verifica se aplicou)
       │
       ├─ Step 5: ensureGameFrameworks()
       │    └─ BepInEx, SMAPI, CET, MelonLoader
       │
       ├─ Step 5.5: ensureGameExternalTools()
       │    └─ Tools externas opcionais
       │
       ├─ Step 6: ensureSkse()
       │    └─ Script Extender (Skyrim, Fallout, etc)
       │
       ├─ Step 7: Deploy mods (APENAS se deployMods=true)
       │    └─ Aba Games NÃO deploya mods
       │
       └─ Step 8: launchGame()
            ├─ buildUmuEnv() → env vars completas
            ├─ spawn(umu-run, [exe], { env })
            └─ Retorna success/failure
```

### 2.5 Fluxo: Process Watcher

```
process-watcher.ts → watchProcesses() (a cada N segundos)
  │
  ├─ 1. Busca todos os jogos não-deletados
  │
  ├─ 2. NativeAddon.getSystemProcessMap() → processos do sistema
  │
  ├─ 3. Para cada jogo:
  │    ├─ Se tem executablePath → verifica se processo existe
  │    ├─ Se NÃO tem → tenta detectar via gameExecutables
  │    └─ hasLinuxCompatibilityProcessMatch() → Wine/Proton
  │
  ├─ 4. Se processo encontrado:
  │    ├─ onOpenGame() → inicia tracking de playtime
  │    └─ onTickGame() → incrementa playtime
  │
  ├─ 5. Se processo sumiu:
  │    └─ onCloseGame() → salva playtime final
  │
  └─ 6. Envia "on-games-running" ao renderer
```

### 2.6 Fluxo: Adicionar Jogo Custom

```
add-game-modal.tsx → handleSubmit()
  │
  ├─ 1. searchGameCover(name) → busca capa no SteamGridDB
  │
  ├─ 2. gamesService.save(game)
  │    └─ window.electron.addCustomGameToLibrary(...)
  │
  └─ add-custom-game-to-library.ts (main process):
       ├─ randomUUID() → objectId
       ├─ Verifica títulos duplicados → " (Copy N)"
       ├─ Se tem steamAppId → baixa capas do Steam CDN
       ├─ Cria winePrefixPath: ~/Games/MakaiForger/{title}
       ├─ Salva em gamesStore
       ├─ Salva assets em gamesShopAssetsStore
       └─ Salva JSON em ~/userData/games/{objectId}.json
```

### 2.7 Fluxo: GameBar (Ações)

```
game-bar.tsx
  │
  ├─ ▶ Play → onPlay() → use-games.ts playGame()
  ├─ ⏹ Stop → onStop() → closeGame()
  ├─ ⚙ Configurar → onConfigure() → abre config modal
  ├─ 🍷 Wine Tools → WineToolsMenu
  │    ├─ Makaitricks → runWineTool("winetricks")
  │    ├─ Task Manager → runWineTool("taskmgr")
  │    ├─ Control Panel → runWineTool("control")
  │    ├─ Registry Editor → runWineTool("regedit")
  │    ├─ Wine Config → runWineTool("winecfg")
  │    ├─ Wine Console → runWineTool("wineconsole")
  │    ├─ Terminal → runWineTool("terminal")
  │    ├─ Run Exe → runWineTool("runexe")
  │    └─ Wine Log → runWineTool("winelog")
  ├─ 🎮 Add to Steam → createSteamShortcut()
  ├─ 🔗 Add to Desktop → createShortcut()
  ├─ 📋 Duplicate → addCustomGameToLibrary()
  ├─ 👁 Hide/Show → updateGameConfig({ isDeleted })
  ├─ ⭐ Favorite → addGameToFavorites()
  ├─ 🍷 Abrir Wine Prefix → openGameWinePrefix()
  ├─ 🧹 Limpar Prefixo → deleteGamePrefix()
  └─ 🗑 Remove → deleteGame()
```

---

## 3. Arquivos Mapeados (~60 arquivos)

### Renderer (UI)

| Arquivo | Linhas | Função |
|---------|--------|--------|
| `Games/index.tsx` | ~20 | Barrel exports |
| `Games/types.ts` | ~10 | Tipos compartilhados |
| `pages/games/hooks/use-games.ts` | ~300 | **Hook principal** — 15+ funções |
| `pages/games/games.scss` | ~200 | Estilos |
| `pages/game-launcher/game-launcher.tsx` | ~100 | Página de launcher |
| `components/cards/*.tsx` | ~350 | 4 tipos de card |
| `components/gamebar/GameBar.tsx` | ~40 | Wrapper visual |
| `components/toolbar/*.tsx` | ~110 | Toolbar + TopBar |
| `services/game-launcher/game-bar/game-bar.tsx` | ~200 | GameBar completo |
| `services/game-launcher/game-bar/wine-tools-menu/*.tsx` | ~120 | Menu Wine |
| `AddGame/add-game-modal.tsx` | ~150 | Modal de adicionar jogo |
| `AddGame/games-service.ts` | ~100 | Service de CRUD |

### Main Process (Backend)

| Arquivo | Linhas | Função |
|---------|--------|--------|
| `events/library/*.ts` | ~50 handlers | Handlers IPC |
| `events/games/sync-steam-library.ts` | ~100 | Sync com Steam |
| `services/game-executables.ts` | ~15 | Executáveis conhecidos |
| `services/game-log-manager.ts` | ~120 | Buffer de logs |
| `services/delete-game.ts` | ~80 | Deleção de jogos |
| `services/process-watcher.ts` | ~400 | Monitoramento de processos |

### Python Backend

| Arquivo | Linhas | Função |
|---------|--------|--------|
| `game_install_core/detect.py` | ~70 | Detecção instalador/portátil |
| `game_install_core/copy.py` | ~150 | Cópia verificada SHA256 |
| `game_install_core/scan.py` | ~120 | Scan de executáveis |
| `game_install_core/snapshot.py` | ~100 | Snapshot + diff |
| `game_install_core/runner.py` | ~80 | Execução de instalador |
| `game_install_core/orchestrator.py` | ~150 | Fluxo completo |
| `game_install_core/server.py` | ~200 | RPC stdio |

---

## 4. Problemas Identificados

### 🔴 Críticos

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 1 | **`scan-installed-games` hardcoded Windows** | `scan-installed-games.ts:12-17` | `SCAN_DIRECTORIES` usa paths Windows (`C:\Games`). No Linux sem Proton, não encontra nada. Deveria detectar o OS e usar paths apropriados. |
| 2 | **`install-game.ts` duplica lógica do Python** | `install-game.ts` | O `runInstallerInContainer` em TS faz a mesma coisa que `runner.py`. Duas implementações manutenção dupla. |
| 3 | **`play-game.ts`ignora `env.ready`** | `play-game.ts:35` | Se `env.ready === false` (problemas encontrados), o código continua mesmo assim. Só bloqueia se `!env.gamePath`. Erros de prefix/proton ignorados. |
| 4 | **`process-watcher` race condition no playtime** | `process-watcher.ts:140-160` | `onOpenGame` chama `trackGamePlaytime` que pode falhar. Se falhar, `unsyncedDeltaPlayTimeInMilliseconds` não é resetado, mas o `gamesPlaytime` já foi setado. Próximo tick pode duplicar o delta. |
| 5 | **`delete-game-from-database` não limpa processos** | `delete-game.ts` | Se o jogo está rodando e o usuário deleta, o processo continua rodando mas o jogo some da lista. |
| 6 | **`add-custom-game-to-library` busca por título duplicado O(n²)** | `add-custom-game-to-library.ts:35-40` | `existingGames.some(...)` itera todos os jogos para checar título. Para muitos jogos, fica lento. |

### 🟡 Médios

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 7 | **`use-games.ts` `duplicateGame` ignora runner/proton** | `use-games.ts:170-180` | `addCustomGameToLibrary` recebe runner e protonVersion como opcionais. O `duplicateGame` não passa esses valores — jogo duplicado perde a configuração. |
| 8 | **`add-game-modal.tsx` `console.log` em produção** | `add-game-modal.tsx:67,93` | `console.log("Loaded protons:", protons)` e `console.log("Saving game:", game)` — dados sensíveis logados. |
| 9 | **`install-library.ts` `spawnSync` bloqueia** | `install-library.ts:68-80` | `spawnSync(winetricksCmd, args, { timeout: 300000 })` — 5 minutos de bloqueio no event loop. Deveria ser `spawn` async. |
| 10 | **`process-watcher` `getGameExecutables` faz fetch a cada init** | `process-watcher.ts:50-80` | `axios.get(externalResourcesUrl + "/game-executables.json")` é chamado na inicialização. Se a rede falhar, `gameExecutables` fica vazio e a detecção automática para. |
| 11 | **`game-log-manager` batch timer nunca para** | `game-log-manager.ts:20-30` | `setInterval` uma vez que inicia, nunca para. Se não há logs, continua verificando a cada 100ms. |
| 12 | **`copy.py` max 50000 arquivos** | `copy.py:45` | Hard limit de 50000 arquivos. Jogos como Skyrim com mods podem ter mais. |
| 13 | **`scan.py` MAX_CANDIDATES = 10** | `scan.py:25` | Se o jogo tem mais de 10 exe, os extras são ignorados. |
| 14 | **`orchestrator.py` fallback silencioso** | `orchestrator.py:80-95` | Se instalador não produz exe, faz fallback para copy. Pode copiar lixo (arquivos temporários do instalador). |
| 15 | **`runner.py` `proc.wait()` bloqueia** | `runner.py:70` | `subprocess.Popen` + `proc.wait()` bloqueia até o instalador fechar. Para instaladores GUI, pode ser minutos. |
| 16 | **`use-games.ts` `hideGame` não atualiza selectedGame** | `use-games.ts:130-140` | Se o jogo selecionado é escondido, `selectedGame` continua apontando para ele. |

### 🟢 Menores

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 17 | **`detect.py` padrão "msi" muito genérico** | `detect.py:12` | `re.compile(r"msi", re.I)` matcha qualquer exe com "msi" no nome (ex: "msi_afterburner.exe"). |
| 18 | **`scan.py` CLASSIFICACAO "unknown" para maioria** | `scan.py:45-55` | Muitos exe de jogos não batem nos padrões. Ficam como "unknown" e só são classificados se o nome bate com game_folder_name. |
| 19 | **`game-bar.tsx` 20+ props** | `game-bar.tsx:15-35` | Interface gigante. Deveria agrupar callbacks em objetos. |
| 20 | **`add-game-modal.tsx` `handleNameChange` async** | `add-game-modal.tsx:62-67` | Chama `getUserHomePath()` a cada tecla. Poderia cachear. |
| 21 | **`process-watcher.ts` `killProcess` usa sudo** | `process-watcher.ts:380-390` | Se `process.kill` falhar, tenta `sudo kill -9`. Pode pedir senha inesperadamente. |
| 22 | **`delete-game.ts` não remove do gamesPlaytime** | `delete-game.ts` | Se deletar um jogo que está rodando, `gamesPlaytime` continua com a entrada. |
| 23 | **`install-library.ts` LIBRARY_MAP incompleto** | `install-library.ts:8-35` | Faltam componentes como `d3dcompiler_47`, `gdiplus`, `corefonts`, `fonts`, etc. |
| 24 | **`game-log-manager.ts` MAX_LINES = 50000** | `game-log-manager.ts:1` | Buffer enorme. Se muitos jogos rodando simultaneamente, pode consumir muita memória. |

---

## 5. Fluxo de Decisão: Instalador vs Portátil

```
source_path
  │
  ├─ É arquivo?
  │    ├─ .exe/.msi → INSTALADOR
  │    └─ Outro → PORTÁTIL (sem exe)
  │
  └─ É pasta?
       ├─ Tem setup*.exe / install*.exe (até 2 níveis)?
       │    └─ SIM → INSTALADOR
       │
       └─ NÃO → PORTÁTIL
            ├─ 0 exe → aviso (copia mesmo assim)
            ├─ 1-50 exe → OK
            ├─ 5000+ exe → aviso (lento)
            └─ 50000+ exe → REJEITA
```

---

## 6. Fluxo de Decisão: Classificação de Executável

```
Nome do .exe
  │
  ├─ setup* / install* / autorun* → SETUP
  │
  ├─ unins* / uninst* / vc_redist* / vcredist* / dotnet* / dxsetup* → REDIST
  │
  ├─ launcher.exe / start*.exe / patcher.exe / updater.exe / makai_time.exe → LAUNCHER
  │
  ├─ game.exe / *-win64-shipping.exe / *-win32-shipping.exe / *_windows.exe / nw.exe → GAME
  │
  └─ Outro → UNKNOWN
       └─ Se nome bate com game_folder_name → GAME
```

---

## 7. Store Keys

| Key Pattern | Conteúdo |
|-------------|----------|
| `steam:{objectId}` | Dados do jogo Steam |
| `custom:{objectId}` | Dados do jogo custom |
| `steam_config:{appId}` | Config separada (prefix, proton) |
| `userPreferences` | Preferências (toggles de notificação) |

### Estrutura do Game

```typescript
interface Game {
  title: string;
  shop: "steam" | "custom";
  objectId: string;
  executablePath?: string;
  winePrefixPath?: string;
  protonPath?: string;
  protonVersion?: string;
  runner: "proton" | "wine" | "steam";
  isDeleted: boolean;
  favorite: boolean;
  playTimeInMilliseconds: number;
  lastTimePlayed: Date | null;
  automaticCloudSync: boolean;
  remoteId?: string;
  launchOptions?: string;
  dllOverrides?: Record<string, string>;
  // ... 77 campos total
}
```

---

## 8. Mapa de Chamadas: Instalação Completa

```
Renderer                              Main Process
────────                              ────────────
Downloads (ou CompactFlow)
  │
  ├─ openGameInstaller() ───────────→ ForgePipeline events
  │    └─ installGame() ───────────→ game_install_core (Python RPC)
  │         ├─ detect_installer_type()
  │         ├─ snapshot_prefix()
  │         ├─ run_installer_in_container()
  │         ├─ find_new_executables()
  │         └─ scan_prefix_for_exes()
  │
  ├─ ProtonRecommendationModal ────→ Seleção de Proton
  │
  └─ ExecutableCandidateModal ─────→ Seleção de executável
       └─ saveInstalledGameExecutable()
            └─ gamesStore.put(gameKey, { executablePath })
                 │
                 └─ Game aparece na aba Games ✅
```

---

## 9. Mapa de Chamadas: Play

```
Renderer                              Main Process
────────                              ────────────
use-games.ts
  │
  └─ playGame(game) ───────────────→ modPlayGame(gameId)
       │                              │
       │                              └─ play-game.ts
       │                                   │
       │                                   ├─ scanEnvironment()
       │                                   ├─ ensureProton()
       │                                   ├─ ensurePrefix()
       │                                   ├─ bridgePrefixToSteam()
       │                                   ├─ applyGameConfigs()
       │                                   ├─ ensureGameFrameworks()
       │                                   ├─ ensureSkse()
       │                                   └─ launchGame()
       │                                        └─ spawn(umu-run, exe)
       │
       └─ process-watcher.ts
            └─ watchProcesses() (polling)
                 ├─ onOpenGame() → playtime tracking
                 ├─ onTickGame() → playtime++
                 └─ onCloseGame() → save playtime
```

---

## 10. Recomendações Prioritárias

### Prioridade Alta

1. **Corrigir `scan-installed-games`** — Detectar OS e usar paths apropriados (Linux: `~/.steam/steam/steamapps/common/`)
2. **Remover duplicação TS/Python** — `install-game.ts` não deveria reimplementar `runner.py`
3. **Corrigir `play-game.ts`** — Respeitar `env.ready` e bloquear se houver erros
4. **Corrigir race condition no playtime** — Usar mutex ou fila de operações
5. **Adicionar limpeza de processos ao deletar jogo** — Chamar `killRunningGameProcesses` antes de deletar

### Prioridade Média

6. **Remover `console.log`** em produção (add-game-modal)
7. **Tornar `install-library.ts` async** — Usar `spawn` em vez de `spawnSync`
8. **Cachear `getGameExecutables`** — Retry com cache em vez de fetch único
9. **Parar batch timer** quando não há subscribers
10. **Aumentar MAX_CANDIDATES** ou tornar configurável
11. **Atualizar `selectedGame` ao esconder jogo**
12. **Passar runner/proton ao duplicar jogo**

### Prioridade Baixa

13. Corrigir padrão "msi" no detect.py
14. Melhorar classificação de exe (padrões mais abrangentes)
15. Reduzir props do GameBar (agrupar em objetos)
16. Cachear `getUserHomePath` no add-game-modal
17. Evitar `sudo kill` inesperado no process-watcher
18. Limpar gamesPlaytime ao deletar jogo
19. Expandir LIBRARY_MAP com mais componentes
20. Reduzir MAX_LINES ou usar LRU eviction

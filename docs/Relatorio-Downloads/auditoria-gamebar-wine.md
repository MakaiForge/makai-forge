# Auditoria: GameBar & Wine/Proton Config

> Data: 2026-08-18
> Escopo: `app/Games/components/gamebar/`, `app/Games/services/game-launcher/game-bar/`, `src/main/services/wine-tools/`

---

## 1. Visão Geral

O GameBar é a barra de ações que aparece quando um jogo está selecionado na aba Games. Ele fornece acesso rápido a ações como jogar, configurar Wine, gerenciar prefixo, etc.

### Fluxo de dados

```
┌──────────────────────────────────────────────────────────────┐
│  Renderer (React)                                            │
│                                                              │
│  GameBar (componente visual)                                 │
│    └─ GameBar (service barrel)                               │
│         ├─ WineToolsMenu                                     │
│         │    ├─ runWineTool(tool) → ipcRenderer.invoke()     │
│         │    └─ openWineConfig() → abre winecfg              │
│         ├─ onPlay()                                         │
│         ├─ onManageProton()                                 │
│         ├─ onManagePrefix()                                 │
│         └─ onOpenFolder()                                   │
│                                                              │
├─────────────── IPC Bridge ───────────────────────────────────┤
│                                                              │
│  Main Process                                                │
│    └─ run-wine-tool.ts (registerEvent)                      │
│         └─ createWineToolRunner({ shop, objectId })         │
│              └─ WineToolRunner.run(tool)                     │
│                   ├─ spawnNativeTool() → Proton dist/bin/    │
│                   └─ spawnWithUmu() → umu-run fallback       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Arquivos Mapeados

### Renderer (UI)

| Arquivo | Linhas | Função |
|---------|--------|--------|
| `app/Games/components/gamebar/GameBar.tsx` | ~35 | Wrapper visual, renderiza o GameBar service |
| `app/Games/services/game-launcher/game-bar/index.tsx` | ~20 | Barrel export do GameBar |
| `app/Games/services/game-launcher/game-bar/game-bar.tsx` | ~200 | **Componente principal** — 15+ botões de ação |
| `app/Games/services/game-launcher/game-bar/wine-tools-menu/wine-tools-menu.tsx` | ~120 | Menu dropdown com ferramentas Wine |
| `app/Games/services/game-launcher/game-bar/game-bar.scss` | ~200 | Estilos do GameBar |
| `app/Games/services/game-launcher/game-bar/wine-tools-menu/wine-tools-menu.scss` | ~100 | Estilos do menu Wine |
| `app/Games/services/game-launcher/game-bar/_layout.scss` | ~80 | Layout grid/flex |
| `app/Games/services/game-launcher/game-bar/_glass.scss` | ~60 | Efeito glass morphism |
| `app/Games/services/game-launcher/game-bar/_accent.scss` | ~40 | Cores de acento |
| `app/Games/services/game-launcher/game-bar/_text.scss` | ~30 | Tipografia |

### Main Process (Backend)

| Arquivo | Linhas | Função |
|---------|--------|--------|
| `app/_main/container/events/run-wine-tool.ts` | ~60 | Event handler IPC → WineToolRunner |
| `src/main/services/wine-tools/runner.ts` | ~300 | **WineToolRunner** — 9 ferramentas Wine |
| `src/main/services/wine-tools/types.ts` | ~25 | Tipos: WineTool, WineToolOptions, WineToolResult |
| `src/main/services/wine-tools/index.ts` | ~5 | Barrel exports |

---

## 3. Ações do GameBar

### 3.1 Botões Principais

| Botão | Ação | IPC Event | Descrição |
|-------|------|-----------|-----------|
| ▶ **Jogar** | `onPlay()` | `modPlayGame` | Inicia o fluxo de 8 steps |
| ⚙ **Configurar Proton** | `onManageProton()` | Abre modal | Trocar versão do Proton |
| 📁 **Abrir Pasta** | `onOpenFolder()` | `shell.openPath` | Abre o diretório do jogo |
| 🗑 **Desinstalar** | `onUninstall()` | `uninstallGame` | Remove prefixo + arquivos |
| 📋 **Gerenciar Prefixo** | `onManagePrefix()` | Abre modal | Opções de prefixo Wine |

### 3.2 Wine Tools Menu (submenu)

| Ferramenta | Tool ID | Comando Wine | Descrição |
|------------|---------|--------------|-----------|
| **Makaitricks** | `winetricks` | `Makaitricks --gui` | GUI de tweaks (customizado) |
| **Task Manager** | `taskmgr` | `taskmgr` | Gerenciador de tarefas Wine |
| **Painel de Controle** | `control` | `control` | Wine control panel |
| **Editor de Registros** | `regedit` | `regedit` | Wine registry editor |
| **Configurações Wine** | `winecfg` | `winecfg` | Configurações gerais Wine |
| **Console Wine** | `wineconsole` | `wineconsole cmd.exe` | Terminal Windows |
| **Terminal Linux** | `terminal` | gnome-terminal/konsole/etc | Terminal com WINEPREFIX |
| **Executar .exe** | `runexe` | caminho do .exe | Executa um executável Windows |
| **Ver Logs** | `winelog` | tail -f do log | Abre logs em tempo real |

### 3.3 Outras Ações (via GameBar)

| Botão | Ação | Descrição |
|-------|------|-----------|
| ☁ **Backup** | `onBackupClick()` | Ludusavi cloud sync |
| ↻ **Sync** | `onSyncClick()` | Sincronizar dados |
| 🎮 **Abrir Mod Manager** | `onOpenModManager()` | Abre o Mod Manager |
| ⭐ **Favoritar** | `onToggleFavorite()` | Adiciona/remove dos favoritos |
| 🏷 **Renomear** | `onRename()` | Renomeia o jogo |
| 📝 **Notas** | `onNotes()` | Adiciona notas ao jogo |
| 🔗 **Steam Grid** | `onSteamGrid()` | Busca artes no SteamGridDB |

---

## 4. WineToolRunner — Detalhamento

### 4.1 Estrutura da Classe

```typescript
class WineToolRunner {
  prefix: string       // Caminho do Wine prefix
  objectId: string     // ID do jogo (ex: "steam_440")
  protonPath: string   // Caminho do Proton instalado
  
  // Métodos públicos
  run(tool: WineTool): Promise<WineToolResult>
  runWinecfg(): Promise<WineToolResult>
  runMakaitricks(): Promise<WineToolResult>
  runTaskmgr(): Promise<WineToolResult>
  runControl(): Promise<WineToolResult>
  runRegedit(): Promise<WineToolResult>
  runWineconsole(): Promise<WineToolResult>
  runTerminal(): Promise<WineToolResult>
  runExe(exePath?: string): Promise<WineToolResult>
  runWineLog(): Promise<WineToolResult>
}
```

### 4.2 Estratégia de Execução

```
spawnTool(args)
  │
  ├─ [1] spawnNativeTool(toolName, args)
  │       Procura em: {protonPath}/dist/bin/{toolName}
  │       Se existe → executa direto (sem Python)
  │       Variáveis: WINEPREFIX
  │
  └─ [2] spawnWithUmu(args) [fallback]
          Usa: umu-run (zipapp Python auto-contido)
          Variáveis: WINEPREFIX, GAMEID, STORE, PROTONPATH
          Remove: PYTHONHOME, PYTHONPATH, PYTHONSTARTUP, PYTHONOPTIMIZE
```

### 4.3 Criação do Runner

```typescript
createWineToolRunner({ shop, objectId })
  │
  ├─ Se shop === "steam":
  │    1. Busca em db.get(`steam_config:{appId}`)
  │    2. Busca em gamesStore.get(`steam:{appId}`)
  │    3. prefix = config.winePrefixPath || game.winePrefixPath
  │    4. protonPath = config.protonPath || game.protonVersion
  │    5. Fallback: findUsableProton(protonPath)
  │
  └─ Outros shops:
       1. Busca em gamesStore.get(`${shop}:${objectId}`)
       2. prefix = game.winePrefixPath
       3. protonPath = game.protonPath
       4. Fallback: findUsableProton(protonPath)
```

---

## 5. Wine Config — Configurações do Prefixo

### 5.1 O que o winecfg controla

O `winecfg` (Wine Configuration) é uma ferramenta nativa do Proton/Wine que permite:

| Configuração | Descrição | Onde é salva |
|-------------|-----------|--------------|
| **Windows Version** | Versão do Windows simulada (Win7, Win10, etc.) | `system.reg` no prefix |
| **Libraries (DLL Overrides)** | Mapeamento de DLLs nativas/builtin | `system.reg` |
| **Graphics** | DPI, WM decoração,屏幕 resolutions | `user.reg` |
| **Drives** | Mapeamento de unidades (C:, Z:, etc.) | `dosdevices/` |
| **Audio** | Drivers de áudio Wine | `system.reg` |
| **Desktop Integration** | Temas, fontes, pastas especiais | `user.reg` |

### 5.2 DLL Overrides no Makai Forge

O Makai Forge gerencia DLL Overrides de forma separada do winecfg:

```
MakaiForge DLL Override Flow:
  1. Usuário configura no modal (ou automáticos)
  2. Salvo em gamesStore: game.dllOverrides = { "d3d11": "builtin", ... }
  3. Na hora de jogar: setupGame() aplica ao prefix
  4. winecfg pode conflitar se o usuário alterar lá
```

### 5.3 Configurações Automáticas do Makai Forge

| Config | Quando aplicada | Onde configurado |
|--------|----------------|------------------|
| **DXVK** | Play step 04 | `steps/04-configs.ts` |
| **MakaiTricks** | Play step 05 | `steps/05-frameworks.ts` |
| **DLL Overrides** | Play step 04 | `steps/04-configs.ts` |
| **Bethesda Registry** | Play step 04 | `steps/04-configs.ts` |
| **Wine Desktop** | Play step 03 | `steps/03-prefix.ts` |

---

## 6. WineToolsMenu — Interface

### 6.1 Layout

```
┌─────────────────────────────────┐
│ 🔧 Ferramentas Wine            │
├─────────────────────────────────┤
│ 🧰 Makaitricks          ──▶   │
│ 📋 Task Manager                 │
│ 🖥 Painel de Controle           │
│ 📝 Editor de Registros          │
│ ⚙ Configurações Wine           │
│ 💻 Console Wine                 │
│ 📂 Terminal Linux               │
│ ▶ Executar .exe                 │
│ 📜 Ver Logs                     │
├─────────────────────────────────┤
│ 📁 Abrir Pasta do Prefixo       │
│ 📁 Abrir Pasta do Jogo          │
└─────────────────────────────────┘
```

### 6.2 Comportamento

- **Hover** → Abre o submenu
- **Click** → Chama `runWineTool(tool)` via IPC
- **Desabilitado** → Prefix não existe ou Proton não configurado
- **Feedback** → Toast de sucesso/erro após execução

---

## 7. Problemas Identificados

### 🔴 Críticos

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 1 | **`winelog` bypassa o WineToolRunner** | `run-wine-tool.ts` | O handler tem lógica duplicada para `winelog` que bypassa o runner. Usa `spawn` direto em vez de `runner.runWineLog()`. Inconsistente. |
| 2 | **`runExe` não valida existência** | `runner.ts:237` | `runExe(exePath?)` não verifica se o arquivo existe antes de tentar executar. Se `exePath` for inválido, o spawn falha silenciosamente. |
| 3 | **`spawnWithUmu` checa binário duas vezes** | `runner.ts:84-85` | `usePython = !fs.existsSync(umuBinary)` mas o método já verificou `fs.existsSync(umuBinary)` na linha 80 e retornou se não existisse. `usePython` será sempre `false`. |
| 4 | **Terminal detection sem cache** | `runner.ts:180` | `findTerminal()` faz `fs.existsSync` para cada terminal a cada chamada. Poderia cachear o resultado. |

### 🟡 Médios

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 5 | **`spawn` ignora erros** | `runner.ts` | Todos os `spawn(..., { detached: true, stdio: "ignore" })` ignoram erros de execução. Se o Proton não existe ou o binário falha, o usuário não recebe feedback. |
| 6 | **`console.error` em produção** | `run-wine-tool.ts:28` | Usa `console.error` em vez de `logger.error`. Inconsistente com o resto do código. |
| 7 | **`runWineLog` assume paths fixos** | `runner.ts:247-256` | Lista de paths de log é hardcoded. Se o Makai Forge mudar a estrutura de logs, quebra. |
| 8 | **Sem timeout para ferramentas** | `runner.ts` | Ferramentas como `winecfg` e `regedit` são GUI apps que rodam indefinidamente. Não há mecanismo de cleanup. |
| 9 | **`createWineToolRunner` dual store** | `runner.ts:288-310` | Busca em `db` E `gamesStore` para Steam. Pode retornar config conflitante se uma fonte tiver dado desatualizado. |
| 10 | **Makaitricks hardcoded** | `runner.ts:131` | O nome do binário é `"Makaitricks"` (com M maiúsculo). Se o proton mudar o nome, quebra. |

### 🟢 Menores

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 11 | **Log paths poderiam usar constants** | `runner.ts:247-256` | Paths hardcoded em vez de usar `logsPath` constant |
| 12 | **`findTerminal` retorna "xterm"** | `runner.ts:199` | Fallback para `xterm` pode não existir em sistemas modernos |
| 13 | **Sem typing para `tool` parameter** | `run-wine-tool.ts:19` | `tool: string` em vez de `tool: WineTool` — aceita qualquer string |
| 14 | **`logOperation` não loga args** | `run-wine-tool.ts` | Loga `tool` mas não loga qual exe foi executado em `runexe` |

---

## 8. Fluxo de Execução — Exemplo: winecfg

```
1. Usuário clica "Configurações Wine" no WineToolsMenu
   │
2. wine-tools-menu.tsx:
   │  runWineTool("winecfg")
   │  → ipcRenderer.invoke("runWineTool", shop, objectId, "winecfg")
   │
3. run-wine-tool.ts:
   │  registerEvent("runWineTool", handler)
   │  → createWineToolRunner({ shop: "steam", objectId: "440" })
   │
4. runner.ts (createWineToolRunner):
   │  → db.get("steam_config:440") → { winePrefixPath, protonPath }
   │  → findUsableProton(protonPath) → "/home/user/Proton 8.0"
   │  → new WineToolRunner(prefix, "440", protonPath)
   │
5. runner.ts (run):
   │  → switch("winecfg") → runWinecfg()
   │  → spawnTool(["winecfg"])
   │
6. runner.ts (spawnTool):
   │  → spawnNativeTool("winecfg", [])
   │     Procura: /home/user/Proton 8.0/dist/bin/winecfg
   │     Se existe: spawn(nativePath, [], { env: { WINEPREFIX } })
   │     Retorna: true
   │
   │  → Se não existe:
   │     spawnWithUmu(["winecfg"])
   │     spawn(umuBinary, ["winecfg"], { env: { WINEPREFIX, GAMEID, PROTONPATH } })
   │
7. Wine config abre na tela do usuário ✅
```

---

## 9. Mapa de Chamadas

```
Renderer                              Main Process
────────                              ────────────
WineToolsMenu.tsx
  │
  ├─ runWineTool("winecfg") ────────→ run-wine-tool.ts
  │                                      │
  │                                      ├─ winelog? → spawn(python, wine_log_gui.py)
  │                                      │
  │                                      └─ createWineToolRunner()
  │                                           │
  │                                           ├─ Steam: db + gamesStore
  │                                           └─ Other: gamesStore
  │                                                │
  │                                                └─ WineToolRunner
  │                                                     │
  │                                                     ├─ run("winecfg")
  │                                                     │    │
  │                                                     │    ├─ spawnNativeTool()
  │                                                     │    │    └─ spawn(proton/bin/winecfg)
  │                                                     │    │
  │                                                     │    └─ spawnWithUmu() [fallback]
  │                                                     │         └─ spawn(umu-run, args)
  │                                                     │
  │                                                     ├─ runMakaitricks()
  │                                                     ├─ runTaskmgr()
  │                                                     ├─ runControl()
  │                                                     ├─ runRegedit()
  │                                                     ├─ runWineconsole()
  │                                                     ├─ runTerminal()
  │                                                     ├─ runExe(exePath)
  │                                                     └─ runWineLog()
  │
  ├─ openWineConfig() ─────────────→ winecfg (direto)
  │
  ├─ onManageProton() ─────────────→ ProtonRecommendationModal
  │
  └─ onManagePrefix() ─────────────→ PrefixManagementModal
```

---

## 10. Recomendações

### Prioridade Alta

1. **Unificar `winelog`** — Remover a lógica duplicada em `run-wine-tool.ts` e usar `runner.runWineLog()` que já existe
2. **Adicionar `tool: WineTool` type** no event handler para evitar strings inválidas
3. **Validar `exePath`** em `runExe()` antes de spawnar
4. **Corrigir lógica `usePython`** — a verificação é redundante (sempre `false`)

### Prioridade Média

5. **Adicionar feedback de erro** — Retornar erro ao renderer quando spawn falha
6. **Cachear `findTerminal()`** — resultado não muda durante a vida do app
7. **Usar `logger`** em vez de `console.error` no `run-wine-tool.ts`
8. **Adicionar typing para `tool`** — usar `WineTool` em vez de `string`

### Prioridade Baixa

9. **Extrair log paths** para constantes centralizadas
10. **Remover `console.log`** de produção

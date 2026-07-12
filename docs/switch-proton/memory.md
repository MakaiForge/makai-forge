# Memory.md — Troca de Proton

## Sessão: 2026-07-11

### O que o usuário pediu
Criar funcionalidade para trocar o Proton de um jogo específico via "Configurar Proton" na UI do Mod Manager. A API precisa:
1. Saber onde está o jogo (gamePath)
2. Saber onde está o prefixo (protonPrefix)
3. Saber qual Proton está usando (protonVersion)
4. Recriar o prefixo com o novo Proton, preservando saves

### Contexto importante
- O usuário tem 3 projetos: Makai Forge (main), XVK-Forge, MusicForge
- Makai Forge: Electron + React + TypeScript + Python Bridge
- O Proton API é chamado de formas diferentes por cada módulo
- O Mod Manager é o único que tem `bridge-context.ts` com tracking de contexto
- O ProtonForge API NÃO recebe nenhum contexto do caller

### O que foi estudado (arquivos lidos)

#### ProtonForge API (tools/python-rpc/protonforge-api/)
- `server.py` — JSON-RPC stdin/stdout, daemon threads, 120s timeout
- `api/handler.py` — 11 métodos registrados, dispatch por string name
- `api/services/proton_versions.py` — escaneia 4 dirs para achar Protons
- `api/services/launch_args/core.py` — monta env vars + comando proton run

#### Prefix Core (tools/prefix/python/prefix/)
- `core.py` — create_prefix (4 estratégias wineboot), delete_prefix (rmtree), clean_prefix
  - create_prefix quando prefixo existe: é NO-OP + instala DLLs
  - prefix_exists: verifica user.reg + system.reg
  - resolve_actual_prefix: handle pfx/ subfolder
  - delete_prefix/shutil.rmtree: NÃO exposto como RPC
- `makaitricks.py` — install_recommended_dlls via Makaitricks/winetricks
- `runner.py` — run_proton_command_for_game (spawn proton run)

#### Mod Manager (tools/Mods_manager/)
- `play/play-game.ts` — 8-step pipeline (detect→proton→prefix→configs→skse→deploy→launch)
- `play/steps/02-proton.ts` — ensureProton: verifica se proton_path existe, se não, baixa
- `play/steps/03-prefix.ts` — ensurePrefix: cria prefixo se não existe
- `play/steps/04-configs.ts` — applyGameConfigs: DLL overrides + winetricks + registry
- `play/steps/06-launch.ts` — launchGame: spawn proton/umu com env vars
- `games/_shared/launch.ts` — getSteamLaunchEnv (encontra Steam compatdata)
- `events/mod-deploy.ts` — handler do botão Deploy manual
- `events/mod-prefix-rpc.ts` — modCreatePrefix, modInstallGameDlls (ProtonForgeRPC)
- `bridge-context.ts` — BridgeContext: {source, gameId, prefixPath, gamePath}

#### ForgePipeline (data/install-api/ForgePipeline/)
- `services/umu.ts` — Umu.launchExecutable: spawn umu-run, SEM RPC Python
- `helpers/launch-game.ts` — launchGame: tenta umu → Wine → native
- NÃO usa ProtonForge API, usa binário umu-run diretamente

#### ProtonForge API (NOVA - data/install-api/proton_recommended/)
- `python/server.py` — 17 métodos, mais completo
- `python/api/handler.py` — adiciona: rate_releases, install-makaitricks, mod_*, recommend_for_modding
- Também stateless, sem context parameter
- `python/bridge/bridge.py` — Bridge com context {prefix_path, game_key, profile}

#### CompactFlow (data/install-api/CompactFlow/)
- `bridge/api.js` — one-shot subprocess (execFileSync), mata processo após cada resposta
- `bridge/install-game/index.js` — chama create_prefix + install_game_dlls
- Sem contexto, sem estado

#### UI
- `ProtonConfigPanel.tsx` — modal simples (input path + configurar)
- `GameConfigPanel.tsx` — config completa (paths, prefix, health, deps, DLLs)
- `ProtonRecommendationModal.tsx` — seletor completo de Proton (705 linhas)
- `useProtonConfig.ts` — hook de estado do Proton
- `ModManagerTopBar.tsx` — botões: Iniciar, Instalar, Deploy, Configurar Proton
- `ModManager.tsx` — root page (695 linhas)

#### Setup Proton Environment (tools/prefix/events/)
- `setup-proton-environment.ts` — fluxo existente: Steam game → clear compatdata → create prefix
- Só funciona para jogos Steam (precisa appId)
- NÃO preserva saves ao deletar prefixo
- NÃO atualiza config do jogo no ModStorageService

### Fluxo de chamada: Mod Manager → Proton API

```
Renderer (React)
  → ipcRenderer.invoke("modCreatePrefix", gameId)
  → Main process: mod-prefix-rpc.ts
    → ProtonForgeRPC.call("create_prefix", {
        game_id: gameId,
        proton_path: config.protonVersion,
        prefix_path: config.protonPrefix,
        auto_dlls: true
      })
    → stdin.write(JSON + "\n")
    → Python server.py dispatch → handler.py → core.py create_prefix()
    → stdout → Promise resolve → IPC response
```

### Fluxo de chamada: Mod Manager → Bridge (com context)

```
Renderer
  → ipcRenderer.invoke("deployMods", {gameId, profile})
  → Main: mod-bridge-service.ts
    → bridgeContextToPayload() → {source: "mod-manager", gameId, prefixPath}
    → bridge.send({cmd: "deploy", ..., context: bridgeCtx})
    → Python bridge.py recebe context, usa prefixPath diretamente
```

### Storage Keys relevantes
```
game:{gameId}:config = {
  gamePath: string,        // ex: /mnt/.../common/Skyrim
  stagingDir: string,      // ex: ~/Games/Mods/skyrim/staging
  protonPrefix: string,    // ex: ~/Games/Prefix/skyrim
  protonVersion: string    // ex: /home/cas/.config/.../GE-Proton11-1
}
```

### Caminhos importantes no filesystem
```
~/.config/makai-forger/                    ← Storage JSON (ModStorageService)
~/.config/makai-forger/compat-tools/compatibilitytools.d/  ← Protons instalados
~/Games/Prefix/skyrim/                     ← Prefixo customizado do Skyrim
~/Games/Mods/skyrim/staging/               ← Staging dir dos mods
~/Games/Mods/skyrim/profiles/test/         ← Profile com modlist + plugins.txt
/home/cas/Documentos/Makai-forge/          ← Repo principal
```

### ID do jogo
- Skyrim LE: steamAppId = "72850"
- Config key: `game:skyrim:config`
- ModStorageService usa `game:{gameId}:config` como key

### Dois Python APIs (manter sincronizado!)
1. **tools/python-rpc/protonforge-api/** — usado por Mod Manager (ProtonForgeRPC)
2. **data/install-api/proton_recommended/python/** — usado por ForgePipeline e CompactFlow

Ambos precisam dos mesmos métodos novos (delete_prefix, clean_prefix, get_prefix_saves, restore_saves).

### O que foi criado nesta sessão
- `docs/switch-proton/AGENTS.md` — contexto do módulo
- `docs/switch-proton/memory.md` — este arquivo
- `docs/switch-proton/module.md` — plano de implementação com 5 fases

### Próximos passos (quando continuar)
1. **Fase 1**: Adicionar métodos RPC em ambos handler.py (delete_prefix, clean_prefix, get_prefix_saves, restore_saves)
2. **Fase 2**: Criar `mod-switch-proton.ts` (handler IPC) + registrar no preload
3. **Fase 3**: Integrar no GameConfigPanel (botão "Trocar Proton")
4. **Fase 4**: Adicionar modo "switch" no ProtonRecommendationModal
5. **Fase 5**: Validações e edge cases

### Bugs corrigidos nesta sessão (contexto)
- Plugins.txt indo pro prefixo errado (Steam compatdata ao invés de custom)
- Proton sobrescrevendo WINEPREFIX (STEAM_COMPAT_DATA_PATH sempre definido)
- getSteamLaunchEnv() sobrescrevendo nosso valor (reaplicar após Object.assign)
- Sem áudio (adicionar dsound + mmdevapi DLL overrides)
- Sem vozes (remover xaudio2 overrides — Proton usa FAudio)

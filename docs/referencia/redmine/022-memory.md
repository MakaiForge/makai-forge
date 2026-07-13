# MEMORY.md — Memória de Sessão Makai Forge

## Sessão Atual: 2026-07-12 — Skyrim Prefix + Steam Launch Analysis

### Contexto
O usuário quer que o Skyrim use o prefixo customizado `~/Games/Prefix/skyrim/` ao invés do Steam compatdata padrão. O prefixo existe e está funcional, mas o jogo pode não estar usando-o ao abrir via Steam.

### Análise Realizada
1. Estudados 3 módulos completos: Mods_manager (play pipeline, games adapters), prefix (creation, validation, DLL overrides), python-rpc (recommendation, launch_args, prefix)
2. Verificado estado atual: symlink OK, config.vdf OK, Proton tool OK
3. Documentado em `023-skyrim-prefix-steam-launch.md`

### Descobertas Chave
- **Bridge** (`steam-prefix-bridge.ts`): cria symlink `compatdata/72850/pfx → ~/Games/Prefix/skyrim` + atualiza config.vdf com GE-Proton9-12
- **Launch** (`07-launch.ts`): primário via `steam://rungameid/72850`, fallback via umu-run direto
- **config.vdf**: `"72850" { "name" "GE-Proton9-12" }` em CompatToolMapping — OK
- **Symlink**: `/mnt/92cbe49c-.../compatdata/72850/pfx → /home/cas/Games/Prefix/skyrim` — OK
- **Logs**: Shows successful bridge + launch via Steam method

### Hipótese Principal
Steam pode não recarregar config.vdf quando já está aberto. O bridge atualiza o arquivo mas Steam mantém cache em memória. Solução: fechar Steam antes de launch OU forçar reload.

### Arquitetura Completa do Pipeline
```
detectGame → prefixPath = config.protonPrefix
  ↓
ensurePrefix → cria via Python wineboot (4 estratégias)
  ↓
bridgePrefixToSteam → symlink compatdata + config.vdf update
  ↓
applyGameConfigs → DLL overrides (18) + winetricks + Bethesda registry
  ↓
deploy → mods symlinks + plugins.txt no prefix
  ↓
launchGame → steam://rungameid/72850 (ou umu-run fallback)
  ↓
Steam → GE-Proton9-12 → WINEPREFIX via symlink → nosso prefixo
```

---

## Sessão Anterior: 2026-07-11 — Prefix Path Bugfix

### Contexto
O usuário (cas, PT-BR) relatou que mods tinham efeito zero no jogo. Investigação revelou que o `plugins.txt` era escrito no prefixo do Steam ao invés do prefixo configurado pelo usuário.

### Bugs Corrigidos (5 arquivos)
1. **play/play-game.ts** — Removido fallback para Steam compatdata
2. **play/steps/03-prefix.ts** — `ensurePrefix` nunca mais cai no Steam
3. **play/steps/06-launch.ts** — `getSteamLaunchEnv` não seta STEAM_COMPAT_DATA_PATH para prefixos customizados
4. **events/mod-deploy.ts** — Botão Deploy manual usa `config.protonPrefix` direto
5. **play/steps/04-configs.ts** — Username derivado via `findPrefixUsername()` ao invés de hardcoded

### Dead Code Limpo
26 arquivos `deploy.ts` removidos (jogos non-Bethesda + variantes skyrim/enderal). Mantidos: `skyrim/deploy.ts` e `morrowind/deploy.ts`.

### Audit de Jogos
- **12 jogos Bethesda**: todos usam prefixPath corretamente via `deploySkyrimVariant` ou `deployBethesda`
- **22 jogos non-Bethesda**: não usam plugins.txt (deployGeneric), não afetados

### Fluxo Correto do Prefixo
```
detectGame → prefixPath = config.protonPrefix
  ↓
ensurePrefix → cria/completa via Python wineboot (NUNCA Steam)
  ↓
deploy → plugins.txt → {prefix}/drive_c/users/{user}/AppData/Local/{game}/plugins.txt
  ↓
launch → WINEPREFIX={prefix} (sem STEAM_COMPAT_DATA_PATH para custom)
```

### Conhecimento Chave
- `resolvePrefixDir()` checa `user.reg` em `prefixPath` e `prefixPath/pfx/`
- `isValidPrefix()` checa `user.reg` + `system.reg` + `drive_c` + `dosdevices`
- `findPrefixUsername()` encontra o username real no prefixo (pode ser "steamuser" ou outro)
- Python `create_prefix` cria prefixo via wineboot com 4 estratégias (system wineboot → umu-run → direct wineboot → proton wineboot)
- `getDeployFunction()` wrapper stripa `_gameId` e passa todos os outros args para `GameModule.deploy`
- `deploySkyrimVariant` cria plugins.txt no profile dir e symlink para o prefixo
- `deployBethesda` escreve plugins.txt direto no prefixo

### Arquivos Importantes
| Arquivo | Função |
|---------|--------|
| `play/play-game.ts` | Orquestrador principal do launch (8 steps: detect→proton→prefix→bridge→configs→frameworks→skse→deploy→launch) |
| `play/steps/01-detect.ts` | Detecção de jogo (Steam/GOG/manual) |
| `play/steps/02-proton.ts` | Resolução/download de Proton |
| `play/steps/03-prefix.ts` | Criação/validação de prefixo Wine |
| `play/steps/04-configs.ts` | DLL overrides, winetricks, registry, My Games |
| `play/steps/06-launch.ts` | Spawn do jogo via umu-run/proton/Steam |
| `events/mod-deploy.ts` | Handler do botão Deploy manual |
| `games/registry.ts` | Registro de todos os jogos + getDeployFunction wrapper |
| `games/skyrim/deploy.ts` | Deploy de Skyrim variants (symlink plugins.txt) |
| `games/_shared/bethesda-deploy.ts` | Deploy de Oblivion/Fallout/Starfield (write plugins.txt) |
| `games/_shared/bethesda-deploy-helpers.ts` | Helpers: deployFilemap, symlinkPluginsTxt |
| `games/_shared/bethesda-plugins.ts` | collectPlugins, pluginsTxtPath |
| `games/_shared/filemap.ts` | buildFilemap, findPrefixUsername |
| `tools/prefix/python/prefix/core.py` | Python create_prefix (5 estratégias wineboot) |
| `services/steam-prefix-bridge.ts` | Bridge: symlink compatdata + config.vdf update |
| `play/steps/07-launch.ts` | Launch: steam:// protocol (primário) + umu-run (fallback) |
| `games/skyrim/launch.ts` | launchSkyrim → launchViaSteam(72850) |
| `games/skyrim/index.ts` | Module: steamAppId=72850, exeName=TESV.exe, SKSE v1_07_03 |
| `games/skyrim/prefix.ts` | DLL overrides (18), winetricks (d3dx9, xact, vcrun2019) |
| `games/skyrim/plugins.ts` | plugins.txt path, vanilla plugins list |
| `games/_shared/launch.ts` | Shared: getSteamLaunchEnv, launchViaSteam, launchViaProton |

### Typecheck
```bash
node /home/cas/Documentos/Makai-forge/node_modules/typescript/bin/tsc --noEmit -p /home/cas/Documentos/Makai-forge/config/tsconfig.node.json --composite false
```
Erros novos: NENHUM. Erros pre-existentes: morrowind/deploy.ts (unused vars), mod-deploy.ts (install.types import).

---

## Fix Implementado: Option B — Skyrim Prefix (12/07/2026)

### Problema
Play aplicava DLL overrides e registry no prefixo customizado, mas lançava via `steam://rungameid/` que ignorava nosso prefixo e usava o `compatdata/72850/pfx/` do Steam.

### Solução
Refatorado `07-launch.ts` para detectar prefixo customizado e lançar via `proton run` com `WINEPREFIX` correto:

**Arquivo**: `tools/Mods_manager/play/steps/07-launch.ts`

**Novas funções**:
- `isSteamCompatPrefix()` — detecta se prefixo está em `compatdata/`
- `buildLaunchEnv()` — monta WINEPREFIX, PROTONPATH, STEAM_COMPAT_DATA_PATH, etc.
- `launchCustomPrefix()` — launch via umu-run ou `proton run` com prefixo customizado
- `ensureSteamAppIdFile()` — cria `steam_appid.txt` para Steam API stubs
- `killStaleWineserver()` — limpa wineserver stale antes de launch
- `findUmuRun()`, `findProtonBin()`, `ensureProtonSymlink()` — helpers

**Fluxo corrigido**:
```
prefixo customizado (não compatdata)? → launchCustomPrefix()
  → WINEPREFIX=~/Games/Prefix/skyrim
  → proton run skse_loader.exe
  → usa nosso prefixo com DLL overrides + registry + mods

prefixo Steam compatdata? → steam://rungameid/ (como antes)
```

### Análise Amethyst (referência)
Comparado com Amethyst Mod Manager (`Desktop/Amethyst-Mod-Manager-1.3.12/`):
- Amethyst usa prefixo do Steam diretamente (não cria custom)
- Amethyst aplica DLLs via `user.reg` no prefixo do Steam
- Amethyst usa `protontricks <appid> run` para launch
- Amethyst NÃO precisa de bridge (usa compatdata nativo)
- Nossa abordagem: manter prefixo customizado + launch via proton run (mais flexível)

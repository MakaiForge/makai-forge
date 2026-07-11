# MEMORY.md — Memória de Sessão Makai Forge

## Última Sessão: 2026-07-11 — Prefix Path Bugfix

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
| `play/play-game.ts` | Orquestrador principal do launch (7 steps) |
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
| `tools/prefix/python/prefix/core.py` | Python create_prefix (4 estratégias wineboot) |

### Typecheck
```bash
node /home/cas/Documentos/Makai-forge/node_modules/typescript/bin/tsc --noEmit -p /home/cas/Documentos/Makai-forge/config/tsconfig.node.json --composite false
```
Erros novos: NENHUM. Erros pre-existentes: morrowind/deploy.ts (unused vars), mod-deploy.ts (install.types import).

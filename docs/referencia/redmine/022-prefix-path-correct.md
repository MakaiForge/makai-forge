# 022 — Prefix Path Bugfix (plugins.txt indo pro prefixo errado)

**Data**: 2026-07-11
**Status**: Resolvido
**Arquivos alterados**: 5 (+ 26 dead code removidos)

## Problema

O `plugins.txt` dos jogos Bethesda era escrito no prefixo do Steam (`compatdata/{appId}/pfx`) ao invés do prefixo configurado pelo usuário em "Configurar Jogo" (`~/Games/Prefix/skyrim`).

Isso causava mods terem efeito zero no jogo — o jogo lia plugins.txt do Steam prefix (vazio/antigo) em vez do prefixo onde os mods estavam de fato deployed.

## Causa Raiz (3 pontos de falha)

### 1. `play/play-game.ts` — Fallback para Steam compatdata
```typescript
// ANTES:
const effectivePrefix = prefixPath;
const configuredPfxExists = prefixPath && fs.existsSync(path.join(prefixPath, "user.reg"));
if (!configuredPfxExists && steamAppId && libraryPath) {
  const steamPfx = path.join(libraryPath, "compatdata", steamAppId, "pfx");
  if (fs.existsSync(steamPfx)) effectivePrefix = steamPfx;  // <-- BUG: ignora prefixo do usuário
}
const finalPrefixPath = useCustomPrefix ? defaultPrefixDir(gameId) : prefixPath;
```

### 2. `play/steps/03-prefix.ts` — ensurePrefix cai no Steam
Quando o prefixo configurado existia mas estava incompleto (só `user.reg`, sem `system.reg`), o `ensurePrefix` fazia fallback para o Steam compatdata ao invés de completar o prefixo.

### 3. `play/steps/06-launch.ts` — getSteamLaunchEnv conflito
```typescript
// ANTES: SEMPRE setava STEAM_COMPAT_DATA_PATH pro Steam, mesmo com prefixo customizado
compatData = path.join(libraryPath, "compatdata", steamAppId);
env.STEAM_COMPAT_DATA_PATH = compatData;  // <-- Proton usava o prefixo errado
```

### 4. `events/mod-deploy.ts` — Botão Deploy manual
`resolveRealPrefix()` SEMPRE resolvia pro Steam compatdata, ignorando `config.protonPrefix`.

### 5. `play/steps/04-configs.ts` — Username hardcoded
`applyGameConfigs` hardcodava "steamuser" ao invés de usar `findPrefixUsername()`.

## Fixes Aplicados

### Fix 1: `play-game.ts`
- Removido fallback Steam → `finalPrefixPath = prefixPath` sempre
- Removidos imports `fs`, `path`, `defaultPrefixDir` (sem uso)

### Fix 2: `03-prefix.ts`
- Removido bloco "Fallback: use Steam compatdata"
- `compatDataPath` derivado: se prefixo está em `compatdata/` usa estrutura Steam, senão usa `path.dirname(prefixPath)`
- Parâmetro `libraryPath` → `_libraryPath`

### Fix 3: `06-launch.ts`
- `getSteamLaunchEnv` detecta se prefixo está dentro de `compatdata/`
- Se NÃO estiver (prefixo customizado): NÃO seta `STEAM_COMPAT_DATA_PATH`
- Parâmetro `libraryPath` → `_libraryPath`

### Fix 4: `mod-deploy.ts`
- `resolveRealPrefix()` removida
- `resolvedPrefix = config.protonPrefix` diretamente

### Fix 5: `04-configs.ts`
- Import de `findPrefixUsername`
- Username derivado: `findPrefixUsername(prefixPath) || "steamuser"`

## Dead Code Removido
26 arquivos `deploy.ts` órfãos em jogos non-Bethesda e variantes skyrim/enderal:
- skyrim-se, skyrim-vr, enderal, enderal-se
- witcher3, cyberpunk2077, larian, minecraft, stardewvalley, valheim, rimworld
- terraria, factorio, projectzomboid, bannerlord, 7daystodie, subnautica
- thelongdark, satisfactory, donotfeedthemonkeys, kerbalspaceprogram
- battletech, dragonageorigins, dragonage2, masseffect, xcom2

Mantidos: `skyrim/deploy.ts` + `morrowind/deploy.ts` (ambos importados)

## Fluxo Correto (pós-fix)
```
Usuário configura prefixo → ~/Games/Prefix/skyrim
  ↓
play-game.ts: finalPrefixPath = prefixPath (sempre do config)
  ↓
ensurePrefix: cria/completa o prefixo via Python wineboot
  ↓
deployBethesda/deploySkyrimVariant: plugins.txt → {prefix}/drive_c/users/{user}/AppData/Local/{game}/plugins.txt
  ↓
launchGame: WINEPREFIX={prefix} (sem STEAM_COMPAT_DATA_PATH pro Steam)
```

## Verificação
- Typecheck: sem erros novos (só pre-existentes em morrowind/deploy.ts e mod-deploy.ts)
- Audit: 12 jogos Bethesda verificados — todos usam prefixPath corretamente
- 22 jogos non-Bethesda: não usam plugins.txt (deployGeneric), não afetados

## Impacto
- **Todos os 12 jogos Bethesda** corrigidos (Skyrim, SE, VR, Enderal, Enderal SE, Oblivion, Fallout 3/NV/4/4VR, Starfield)
- **Jogos non-Bethesda**: sem mudança (deployGeneric não usa prefixPath)
- **Compatibilidade retroativa**: prefixos existentes no Steam continuam funcionando (detecção automática no primeiro play)

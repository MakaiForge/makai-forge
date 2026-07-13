# 023 — Skyrim: Prefixo Customizado + Launch via Steam

## Problema
O Skyrim (Steam AppID 72850) não reconhece o prefixo Wine customizado (`~/Games/Prefix/skyrim/`) quando aberto via `steam://rungameid/72850`. O prefixo existe, está funcional, mas o jogo pode estar usando o compatdata padrão do Steam ao invés do nosso.

## Estado Atual (verificado 12/07/2026)

### Infraestrutura OK
| Componente | Status | Caminho |
|-----------|--------|---------|
| Prefixo customizado | OK | `/home/cas/Games/Prefix/skyrim/` |
| Symlink compatdata | OK | `.../compatdata/72850/pfx → /home/cas/Games/Prefix/skyrim` |
| config.vdf | OK | `"72850" { "name" "GE-Proton9-12" }` em CompatToolMapping |
| Proton tool (Steam) | OK | `~/.steam/steam/compatibilitytools.d/GE-Proton9-12 → MakaiForger/.../GE-Proton9-12` |
| Proton tool (MakaiForger) | OK | `~/.config/makai-forger/compat-tools/compatibilitytools.d/GE-Proton9-12/` |
| Bethesda registry | OK | `.bethesda_registry_seeded` marker presente |
| DLL overrides | OK | 18 overrides em user.reg (xaudio2, x3daudio, winmm, version) |
| SKSE | OK | `skse_loader.exe` no game path |

### Config no mods-store.json
```json
{
  "game:skyrim:config": {
    "gamePath": "/mnt/92cbe49c-.../SteamLibrary/steamapps/common/Skyrim",
    "stagingDir": "/home/cas/Games/Mods/skyrim/staging",
    "protonPrefix": "/home/cas/Games/Prefix/skyrim",
    "protonVersion": ""
  },
  "proton_binary": "/home/cas/.config/makai-forger/compat-tools/compatibilitytools.d/GE-Proton11-1"
}
```

**Nota**: `proton_binary` aponta para GE-Proton11-1 mas logs mostram GE-Proton9-12 sendo usado (downloaded on-demand porque o proton binário do 11-1 existia mas o 9-12 foi baixado depois).

## Arquitetura de Launch (3 camadas)

### Camada 1: Bridge (steam-prefix-bridge.ts)
```
1. findAllSteamLibraries() → busca compatdata/{appId}
2. Cria symlink: compatdata/72850/pfx → ~/Games/Prefix/skyrim
3. setSteamGameProton(72850, "GE-Proton9-12") → atualiza config.vdf
```
**Resultado**: Steam encontra o prefixo via symlink, usa GE-Proton9-12 via config.vdf

### Camada 2: Launch via Steam (07-launch.ts)
```typescript
// Primário: Steam protocol
spawn("steam", ["steam://rungameid/72850"])

// Fallback: umu-run direto
spawn("umu-run", [launchExe], { env: { WINEPREFIX: prefixPath, ... } })
```

### Camada 3: Steam Interno
```
Steam lê config.vdf → CompatToolMapping[72850] = GE-Proton9-12
  ↓
Steam resolve compatdata/72850/pfx → symlink → ~/Games/Prefix/skyrim
  ↓
Proton (GE-Proton9-12) recebe WINEPREFIX=.../pfx (= nosso prefixo)
  ↓
Jogo roda com nosso prefixo, saves, configs, mods
```

## Possíveis Causas de Falha

### 1. Steam não recarrega config.vdf em runtime
**Hipótese mais provável**: Se o Steam já está aberto quando `setSteamGameProton()` é chamado, o Steam pode ter o config.vdf em cache e não reler.

**Verificação**: Fechar o Steam completamente, depois abrir MakaiForge e clicar Play.

### 2. Steam usa Proton own path ao invés do config.vdf
O Steam pode ter lógica interna que优先 usa o Proton instalado em `steamapps/common/` (Proton Experimental) ao invés do compattool mapping.

**Verificação**: No Steam, ir em Propriedades → Compatibilidade → ver se "GE-Proton9-12" está selecionado para Skyrim.

### 3. Symlink quebrado ou não seguido
Embora `ls -la` mostre o symlink correto, o Steam pode ter restrições com symlinks.

**Verificação**: `stat` e `readlink` para confirmar, e verificar se o Steam consegue ler o prefixo.

### 4. SteamClientPath incorreto
`findSteamClientPath()` pode retornar path errado, causando `STEAM_COMPAT_CLIENT_INSTALL_PATH` inválido.

**Verificação**: Log mostra `STEAM_COMPAT_CLIENT_INSTALL_PATH: /home/cas/.steam/steam` — parece correto.

## Fluxo de Debug

### Teste 1: Fechar Steam, reabrir, e tentar
```bash
# Fechar Steam completamente
killall steam
# Esperar 5 segundos
sleep 5
# Reabrir Steam
steam &
# Abrir MakaiForge e clicar Play no Skyrim
```

### Teste 2: Verificar se Steam reconhece o Proton
```bash
# No Steam: Propriedades do Skyrim → Compatibilidade → Force GE-Proton9-12
# Se não aparece, o Proton não está registered no Steam
```

### Teste 3: Launch direto via Proton (bypass Steam)
```bash
WINEPREFIX=/home/cas/Games/Prefix/skyrim \
STEAM_COMPAT_DATA_PATH=/home/cas/Games/Prefix/skyrim \
STEAM_COMPAT_CLIENT_INSTALL_PATH=/home/cas/.steam/steam \
STEAM_COMPAT_INSTALL_PATH=/mnt/92cbe49c-fae8-4ef5-b554-6ad537fcf9cb/SteamLibrary/steamapps/common/Skyrim \
SteamAppId=72850 \
SteamGameId=72850 \
PROTONPATH=/home/cas/.config/makai-forger/compat-tools/compatibilitytools.d/GE-Proton9-12 \
umu-run /mnt/92cbe49c-fae8-4ef5-b554-6ad537fcf9cb/SteamLibrary/steamapps/common/Skyrim/skse_loader.exe
```

### Teste 4: Verificar log do Proton
```bash
# Proton cria log em ~/steam-{appId}.log
cat ~/steam-72850.log | head -50
```

## Arquivos Envolvidos

| Arquivo | Função |
|---------|--------|
| `services/steam-prefix-bridge.ts` | Symlink compatdata + config.vdf update |
| `play/play-game.ts` | Orquestrador 8-step pipeline |
| `play/steps/07-launch.ts` | spawn steam:// ou umu-run |
| `play/steps/01-detect.ts` | Detecta prefixPath de config |
| `play/steps/03-prefix.ts` | Cria/valida prefixo |
| `games/skyrim/launch.ts` | `launchSkyrim()` → `launchViaSteam(72850)` |
| `games/skyrim/index.ts` | steamAppId=72850, exeName=TESV.exe |
| `prefix/core/steam-paths.ts` | `findAllSteamLibraries()`, `findSteamClientPath()` |
| `prefix/core/dll-overrides.ts` | `applyWineDllOverrides()` |
| `prefix/core/bethesda-registry.ts` | `seedBethesdaRegistry()` |

## Solução Implementada (Option B — 12/07/2026)

### Problema raiz
O Play **aplica DLL overrides e registry corretamente** no prefixo customizado (step 4), mas depois lança via `steam://rungameid/` que **ignora** nosso prefixo e usa `compatdata/72850/pfx/` do Steam — perdendo todas as DLL overrides, registry entries e mod deployments.

### Fix: `07-launch.ts` — Launch via proton run para prefixos customizados

**Antes** (bugado):
```
steamAppId existe? → SIM → steam://rungameid/72850 (ignora prefixo customizado)
```

**Depois** (corrigido):
```
prefixo é customizado (não compatdata)? → SIM → proton run com WINEPREFIX=prefixo customizado
prefixo é Steam compatdata? → SIM → steam://rungameid/ (Steam gerencia)
```

### Fluxo corrigido
```
Step 4: applyGameConfigs → DLL overrides + registry no ~/Games/Prefix/skyrim/  ✅
Step 8: launchGame → detecta prefixo customizado → launchCustomPrefix()
  → WINEPREFIX=~/Games/Prefix/skyrim
  → PROTONPATH=.../GE-Proton9-12
  → STEAM_COMPAT_DATA_PATH=~/Games/Prefix/skyrim
  → steam_appid.txt criado no game dir
  → proton run skse_loader.exe  (ou umu-run)
  → Jogo usa nosso prefixo com DLL overrides + registry + mods  ✅
```

### Por que SKSE funciona via proton run
- Proton fornece `steam_api.dll` stub que o SKSE usa
- `skse_steam_loader.dll` faz hook no Steam API stub do Proton
- Steam client não precisa estar rodando para SKSE via proton run
- `steam_appid.txt` garante que Steam API stub sabe o game ID

### Arquivos modificados
| Arquivo | Mudança |
|---------|---------|
| `play/steps/07-launch.ts` | Refatorado: funções helper extraídas, `launchCustomPrefix()` adicionado, detecta prefixo customizado vs Steam compatdata |

### Novas funções
- `isSteamCompatPrefix()` — detecta se prefixo está dentro de `compatdata/`
- `buildLaunchEnv()` — monta env vars para launch (WINEPREFIX, PROTONPATH, etc.)
- `launchCustomPrefix()` — launch via proton run/umu-run com prefixo customizado
- `ensureSteamAppIdFile()` — cria `steam_appid.txt` no game dir
- `killStaleWineserver()` — mata wineserver stale antes de launch
- `findUmuRun()` — encontra umu-run (sistema ou bundled)
- `findProtonBin()` — encontra binário proton no diretório
- `ensureProtonSymlink()` — cria symlink do Proton em compatibilitytools.d

### NÃO modificado
- `steam-prefix-bridge.ts` — mantido (symlink + config.vdf ainda úteis para Steam compatdata)
- `04-configs.ts` — mantido (DLL overrides + registry aplicados ao prefixo certo)
- `play-game.ts` — mantido (chama bridge antes de configs, fluxo correto)

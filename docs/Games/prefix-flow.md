# Fluxo Completo: Prefix + Proton + Launch

## Os 4 Diretórios que se Comunicam

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Mod Manager (app/Catalogo/GameMod/)                        │
│    - UI: seleção do jogo, mods, botão Play                  │
│    - play/play-game.ts: orquestra os 8 steps                │
│    - Events: IPC handlers (modPlayGame, saveGameConfig...)  │
├─────────────────────────────────────────────────────────────┤
│ 2. Proton Tools (tools/proton-tools/)                       │
│    - 22 forks: GE-Proton, CachyOS, UMU, Luxtorpeda...      │
│    - Download/extract/install Proton versions               │
│    - Storage: ~/.config/makai-forger/compat-tools/          │
│    - Recomendação: fork_catalog.db + proton_recommended.db  │
├─────────────────────────────────────────────────────────────┤
│ 3. Prefix (app/_main/container/)                                   │
│    - umu-run: binário de launch via Wine/Proton             │
│    - python/cli.py: bridge para Python RPC                  │
│    - python/prefix/core.py: cria prefixo Wine               │
│    - 4-strategy waterfall: wineboot → umu-run → proton      │
├─────────────────────────────────────────────────────────────┤
│ 4. Python RPC (app/_main/torrent-rpc/protonforge-api/)           │
│    - server.py: JSON-RPC sobre stdin/stdout                 │
│    - handler.py: 15 métodos (create_prefix, recommend...)   │
│    - services/: recommendation, proton_versions, launch_args│
│    - ProtonForgeRPC class (Electron-side): persistent child │
└─────────────────────────────────────────────────────────────┘
```

## Fluxo: Usuário clica Play

```
1. detectGame(gameId)                  [01-detect.ts]
   ├─ Lê game:{gameId}:config do ModStorageService
   ├─ Se não tem: escaneia Steam libs → appmanifest → default paths
   ├─ Default prefix: ~/Games/Prefix/{slug}
   ├─ Default staging: ~/Games/Mods/{slug}/staging
   └─ Salva config → { gamePath, stagingDir, protonPrefix, protonVersion }

2. ensureProton(gameId, send, prefix)  [02-proton.ts]
   ├─ RPC: recommend_proton(gameId) → Python server.py
   ├─ Checa mismatch Proton vs prefix (GE vs Steam)
   ├─ Escaneia ~/.config/makai-forger/compat-tools/
   └─ Se não tem: downloadTool() → salva "proton_binary"

3. ensurePrefix(gameId, prefix, proton) [03-prefix.ts]
   ├─ Valida: user.reg + system.reg + drive_c + dosdevices
   ├─ Se válido: RETURN
   ├─ Se inválido: runPythonCommand("create-prefix", [...])
   │   └─ cli.py → core.py → 4-strategy waterfall
   └─ Fallback: ensurePrefixDir() (dir + user.reg mínimo)

4. applyGameConfigs()                  [04-configs.ts]
   ├─ DLL overrides → user.reg
   ├─ Registry Bethesda → system.reg
   ├─ Winetricks deps (vcrun, d3dx9, etc.)
   ├─ dxvk.conf
   ├─ My Games dir (Skyrim.ini, etc.)
   └─ Skyrim LE: bBorderless=1 fix

5. ensureGameFrameworks()              [05-frameworks.ts]
6. ensureSkse()                        [06-skse.ts]
7. deployMods()                        [play-game.ts]
8. launchGame()                        [07-launch.ts]
```

## Paths de Storage

| Key | Conteúdo | Escrito por |
|-----|----------|-------------|
| `game:{gameId}:config` | `{gamePath, stagingDir, protonPrefix, protonVersion}` | detectGame, saveGameConfig |
| `proton_binary` | `/path/to/GE-Proton11-1` | 02-proton.ts (3 places) |
| `game:{gameId}:profile:{name}:modlist` | `ModlistEntry[]` | install/remove/toggle |

## Proton Resolution Chain

```
game config.protonVersion
  → ModStorageService.get("proton_binary")
    → ~/.config/makai-forger/compat-tools/compatibilitytools.d/
      → umu-run fallback
```

## Umu-run como User Real

Quando Electron roda como root (SUDO_USER=cas), o umu-run
deve ser spawnado como `cas` via `su - cas -c "env vars + umu-run"`.
Wine precisa do DISPLAY/XAUTHORITY do user login.

## Prefix Path Communication

O prefixPath vem de: config → detectGame → ModStorageService
O Python prefix/core.py DEFAULT é ~/games/proton-forger/{game_id}
Mas o Mod Manager SEMPRE passa prefixPath explicitamente.

Os 4 diretórios convergem via:
- IPC channels (Electron → Python)
- ModStorageService (JSON KV compartilhado)
- Filesystem (prefix dir, staging dir, compat-tools dir)

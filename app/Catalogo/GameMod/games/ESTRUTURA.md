# Arquitetura dos Módulos de Jogo

## Princípio

Cada jogo é auto-suficiente dentro de `games/<game>/`. A lógica de deploy, launch,
prefixo, DLLs, routing e ferramentas vive DENTRO da pasta do jogo, não nos
services/events genéricos. Jogos que compartilham engine usam `games/engine/`
para código compartilhado (ex: `games/bethesda/`, `games/larian/`).

## Estrutura de um jogo Bethesda (Skyrim Vanilla como referência)

```
games/skyrim/                     # gameId = "skyrim"
├── index.ts                      # Factory: cria GameModule com todos os sub-módulos
├── skyrim.constants.ts           # Constantes: steam_id, alt_steam_ids, exe_name,
│                                 #   nexus_domain, loot_type, AppData paths,
│                                 #   MyGames paths, save extension, script extender
├── deploy.ts                     # Deploy específico:
│                                 #   1. swap_launcher (SKSE → copia sobre o .exe original)
│                                 #   2. Chama bethesda/deploy.ts (move Data → Data_Core,
│                                 #      deploy_filemap, deploy_core, restore)
│                                 #   3. Symlink plugins.txt → prefixo
│                                 #   4. Symlink INIs → My Games (opcional)
│                                 #   5. Symlink Saves → perfil (opcional)
│                                 #   6. Archive invalidation (BSA)
├── restore.ts                    # Restore específico:
│                                 #   1. Restaura launcher original
│                                 #   2. Chama bethesda/restore.ts
│                                 #   3. Remove symlinks plugins.txt/INIs/Saves
│                                 #   4. Reverte archive invalidation
├── launch.ts                     # Launch via Steam + Proton:
│                                 #   - steam steam://rungameid/<app_id>
│                                 #   - OU (fallback) proton run <exe> com env vars:
│                                 #       STEAM_COMPAT_DATA_PATH, STEAM_COMPAT_CLIENT_INSTALL_PATH,
│                                 #       STEAM_COMPAT_INSTALL_PATH, SteamAppId, SteamGameId
│                                 #   - OU get_launch_command() nativo (ex: flatpak run OpenMW)
├── prefix.ts                     # Configuração do prefixo Proton:
│                                 #   - wine_dll_overrides → escreve user.reg
│                                 #   - auto_install_deps → vcredist + d3dcompiler_47
│                                 #   - winetricks_components → winetricks verbs
│                                 #   - wizard_tools → lista de ferramentas
├── routing.ts                    # Custom routing rules:
│                                 #   - ENB Series → raiz do jogo (d3d11.dll, enbseries/, etc.)
│                                 #   - SKSE → raiz (skse64_loader.exe)
│                                 #   - Saves → dentro do prefixo (My Games)
│                                 #   - d3dcompiler_47.dll → raiz
│                                 #   - presets de personagem → Data/SKSE/Plugins/...
├── invalidation.ts               # Archive invalidation (BSA/BA2):
│                                 #   - Dummy BSA file
│                                 #   - SArchiveList management
│                                 #   - bInvalidateOlderFiles
│                                 #   - FalloutCustom.ini para listas > 255 chars
├── tools.ts                      # Ferramentas externas:
│                                 #   - SSEEdit, FNIS, BodySlide, Outfit Studio
│                                 #   - DynDOLOD, TexGen, xLODGen
│                                 #   - Wrye Bash, zEdit
│                                 #   - Pandora Behavior Engine
│                                 #   - BethINI, Creation Kit
│                                 #   - ESLifier, VRAMr, BENDr, ParallaxR
│                                 #   - SkyGen, Plugin Audit
├── frameworks.ts                 # Script extenders:
│                                 #   - { "Script Extender": "skse_loader.exe" }
│                                 #   - Detecta presença e retorna banner (🟢/🔴)
└── plugins.ts                    # plugins.txt + load order:
                                 #   - Star prefix (*plugin.esp) ativo/inativo
                                 #   - plugins.txt path dentro do prefixo
                                 #   - Função de load order
```

## Estrutura compartilhada (Bethesda engine)

```
games/bethesda/
├── index.ts                      # bethesdaModule() factory (já existe)
├── deploy.ts                     # deploy_filemap + move_to_core + deploy_core
│                                 #   (extraído de services/mod-deploy/core.ts)
├── restore.ts                    # restore_data_core (extraído de core.ts)
├── plugins.ts                    # plugins.txt path + collectPlugins (já existe)
├── invalidation.ts               # Lógica base de BSA invalidation:
│                                 #   write_dummy_bsa, delete_dummy_bsa
│                                 #   ensure_in_archive_list, append_to_archive_list
│                                 #   remove_from_archive_list
├── launch.ts                     # Lógica de launch compartilhada (SteamAppId, env vars)
├── prefix.ts                     # DLL overrides comuns (winmm, version pra todos)
└── routing.ts                    # Routing base: saves routing rule, xEdit tools
```

## Estrutura de engine não-Bethesda

### Larian (BG3, DOS2)
```
games/larian/
├── index.ts
├── launch.ts                     # steam://rungameid + Proton env vars
├── prefix.ts                     # DLL overrides (winhttp para Script Extender)
├── tools.ts                      # Mod Manager, Script Extender
├── routing.ts                    # PAK files → Data/ (ou Mods/)
├── deploy.ts                     # Public/ + Mods/ diretórios
└── frameworks.ts                 # Script Extender (bg3se_loader.exe)
```

### Cyberpunk 2077
```
games/cyberpunk2077/
├── index.ts
├── launch.ts                     # steam://rungameid
├── prefix.ts                     # red4ext + REDmod deps
├── tools.ts                      # WolvenKit, ArchiveXL, TweakXL
├── routing.ts                    # archive/pc/mod/ para .archive
└── frameworks.ts                 # RED4ext, CET (Cyber Engine Tweaks)
```

### Witcher 3
```
games/witcher3/
├── index.ts
├── launch.ts                     # steam://rungameid
├── prefix.ts                     # Script Merger deps
├── tools.ts                      # Script Merger, ModLimit Fix
└── routing.ts                    # mods/ diretório
```

## Como os eventos/services chamam os módulos

Cada evento IPC que antes chamava um service genérico agora pergunta ao
`registry.ts` qual módulo de jogo está ativo e delega pra ele.

### Exemplo: mod-deploy.ts (evento IPC)

```typescript
// ANTES: chamava ModDeployService.deploy() genérico
// DEPOIS:
import { getDeployFunction } from "@games/registry";

registerEvent("deployMods", async (event, gameId, gamePath, ...) => {
  const deployFn = getDeployFunction(gameId);
  // deployFn é skyrim/deploy.ts, bethesda/deploy.ts, etc.
  return deployFn(gameId, gamePath, ...);
});
```

### Exemplo: mod-proton/info.ts (evento IPC)

```typescript
// ANTES: lógica genérica que procura App ID
// DEPOIS: usa os steam_id + alt_steam_ids do módulo do jogo
import { getGameModule } from "@games/registry";

registerEvent("getGameProtonInfo", async (event, gameId) => {
  const mod = getGameModule(gameId);
  // mod.steamAppId → "72850" (Skyrim)
  // mod.altSteamIds → ["72850_eng"] (se houver)
  // Busca prefixo em compatdata/<app_id>/pfx
  // Retorna currentProton, recommendation, etc.
});
```

### Exemplo: mod-exe-launcher.ts

```typescript
// ANTES: launch por Proton direto
// DEPOIS: verifica launch do jogo primeiro
import { getGameModule } from "@games/registry";

registerEvent("launchExe", async (event, gameId, exePath) => {
  const mod = getGameModule(gameId);
  // Se exePath é o jogo principal:
  //   mod.getLaunchCommand() ? nativo : steam://rungameid
  // Se exePath é ferramenta (SSEEdit):
  //   proton run <exe> com env vars
});
```

## Interface expandida de GameModule

```typescript
interface GameModule {
  // --- Metadados (já existem) ---
  id: string
  displayName?: string
  aliases: string[]
  steamAppId?: string
  altSteamAppIds?: string[]          // NOVO: GOTY, localized editions
  nexusDomain?: string
  lootType?: string
  exeName?: string                   // NOVO: exe principal do jogo
  preferredLaunchExe?: string        // NOVO: exe preferido (ex: skse64_loader.exe)

  // --- Detecção (já existe) ---
  detect(gamePath: string): boolean

  // --- Deploy (já existe, expandido) ---
  getDeployTarget(gamePath: string): string
  shouldWritePluginsTxt(): boolean
  getPluginExtensions(): string[]
  onBeforeDeploy?(...): void
  onAfterDeploy?(...): void

  // --- NOVOS: Deploy específico ---
  deploy?(gamePath: string, stagingDir: string, modlist: ModlistEntry[],
          profile: string, prefixPath?: string, mode?: LinkMode): Promise<DeploymentResult>
  restore?(gamePath: string, stagingDir: string, profile: string,
           prefixPath?: string): Promise<void>

  // --- NOVOS: Launch ---
  getLaunchCommand?(): string[] | null  // comando nativo (ex: ["flatpak", "run", "openmw"])
  getLaunchEnv?(gamePath: string, prefixPath: string,
                protonPath?: string): Record<string, string>

  // --- NOVOS: Proton/Prefix ---
  getWineDllOverrides?(): Record<string, string>  // DLL overrides por jogo
  getAutoInstallDeps?(): string[]                  // vcredist, d3dcompiler_47
  getWinetricksComponents?(): string[]             // winetricks verbs

  // --- NOVOS: Routing ---
  getCustomRoutingRules?(): CustomRule[]

  // --- NOVOS: Frameworks (Script Extenders) ---
  getFrameworks?(): Record<string, string>  // { "Script Extender": "skse64_loader.exe" }

  // --- NOVOS: Archive Invalidation ---
  getArchiveInvalidationConfig?(): ArchiveInvalidationConfig | null

  // --- Já existem ---
  getArchiveHandlers(): ArchiveHandler[]
  getScriptExtender(): ScriptExtenderDef | null
  getExternalTools(): ExternalToolDef[]
}

interface CustomRule {
  dest: string                       // diretório relativo ao game root
  filenames?: string[]               // nomes de arquivo (ex: ["d3d11.dll"])
  extensions?: string[]              // extensões (ex: [".ess"])
  folders?: string[]                 // pastas para mover inteiras (ex: ["enbseries"])
  flatten?: boolean                  // flatten na destino
  looseOnly?: boolean                // só arquivos soltos (sem subpasta)
  toPrefix?: boolean                 // destino é DENTRO do prefixo, não do game root
  mirrorDests?: string[]             // destinos adicionais (ex: GOG saves)
}

interface ArchiveInvalidationConfig {
  enabled: boolean
  bsaName: string | null             // nome do dummy BSA (ex: "Skyrim - Invalidation.bsa")
  bsaVersion: number | null          // versão do header BSA
  archiveListKey: string             // "SArchiveList"
  archiveListInPrefsIni: boolean     // se escreve no Prefs INI também
  needsModBsas: boolean              // se precisa registrar BSAs de mods
  modBsaExtensions: string[]         // [".bsa", ".ba2"]
  invalidationIniKey: string         // "bInvalidateOlderFiles"
  customIniFilename?: string         // "FalloutCustom.ini" para bypass de 255 chars
  archiveListFixName?: string        // "Command Extender" (nome amigável)
  archiveListFixPath?: string        // "Data/FOSE/Plugins/CommandExtender.dll"
  iniFilename: string                // "Skyrim.ini"
  prefsIniFilename?: string          // "SkyrimPrefs.ini"
}
```

## Status atual (completo — Jul 2026)

Todos os 34 jogos seguem a estrutura documentada acima:

| Tipo | Jogos | Sub-módulos |
|------|-------|-------------|
| Skyrim Vanilla | `skyrim/` | 10 arquivos (deploy integrado com restore) |
| Skyrim-derived | `skyrim-se/`, `skyrim-vr/`, `enderal/`, `enderal-se/` | 11 arquivos (index, constants, deploy, restore, launch, prefix, routing, invalidation, plugins, frameworks, tools) |
| Bethesda | `fallout3/`, `falloutnv/`, `fallout4/`, `fallout4-vr/`, `oblivion/`, `morrowind/`, `starfield/` | 11 arquivos |
| Não-Bethesda | 22 jogos (witcher3, cyberpunk2077, larian, minecraft, etc.) | 6 arquivos (index, constants, deploy, prefix, routing, tools) |

Cada jogo é auto-suficiente: ao abrir a pasta, você vê todos os sub-módulos com
suas responsabilidades explícitas. O aplicativo usa `registry.ts` → `getGameModule(gameId)`
para carregar as configurações de dentro da pasta do jogo.

## Referência Amethyst

| Amethyst (BaseGame) | Makai Forge (GameModule) | Arquivo |
|---------------------|--------------------------|---------|
| `steam_id` | `steamAppId` | `*constants.ts` |
| `alt_steam_ids` | `altSteamAppIds` | `*constants.ts` |
| `exe_name` | `exeName` | `*constants.ts` |
| `preferred_launch_exe` | `preferredLaunchExe` | `*constants.ts` |
| `wine_dll_overrides` | `getWineDllOverrides()` | `prefix.ts` |
| `winetricks_components` | `getWinetricksComponents()` | `prefix.ts` |
| `auto_install_deps` | `getAutoInstallDeps()` | `prefix.ts` |
| `frameworks` | `getFrameworks()` | `frameworks.ts` |
| `get_launch_command()` | `getLaunchCommand()` | `launch.ts` |
| `custom_routing_rules` | `getCustomRoutingRules()` | `routing.ts` |
| `deploy()` | `deploy()` | `deploy.ts` |
| `restore()` | `restore()` | `restore.ts` |
| `_symlink_plugins_txt` | `plugins.ts` | `plugins.ts` |
| `_symlink_profile_ini_files` | deploy + routing | `deploy.ts` |
| `_symlink_profile_saves` | deploy + routing | `deploy.ts` |
| `apply_archive_invalidation` | invalidation.ts + deploy | `invalidation.ts` |
| `wizard_tools` | `getExternalTools()` + tools.ts | `tools.ts` |

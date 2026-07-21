# API de Instalação de Mods — Jogos Bethesda

## Objetivo

Padronizar a instalação de mods para jogos Bethesda (Skyrim LE, Skyrim SE, Fallout 4, Fallout NV, Oblivion, etc.) no Makai Forge. Cada jogo tem sua própria pasta em `app/Catalogo/GameMod/games/<game-id>/` com estrutura modular independente, mas compartilhando os mesmos padrões de instalação.

## Estrutura de um Game Module

```
games/<game-id>/
├── index.ts              # Factory: create<Game>Module() — exporta GameModule
├── <game>.constants.ts   # steamAppId, exeName, nexusDomain, etc.
├── deploy.ts             # deploy + restore — symlink/staging
├── launch.ts             # getLaunchEnv, launchViaSteam, launchViaProton
├── prefix.ts             # seedRegistry, getMyGamesSubpath, autoInstallDeps
├── frameworks.ts         # SKSE, script extenders
├── plugins.ts            # extensões de plugin (.esp, .esm, etc.)
├── routing.ts            # regras de roteamento de arquivos
├── invalidation.ts       # archive invalidation (BSA)
├── archive.ts            # extração de archives (BSA, etc.)
├── tools.ts              # ferramentas externas
├── fomod/
│   ├── fomod-types.ts    # Tipos: FomodConfig, Step, Group, Plugin, File
│   ├── fomod-parser.ts   # Parser XML de ModuleConfig.xml
│   └── fomod-service.ts  # SkyrimFomodService: parse + install
```

## Fluxo de Instalação de um Mod

```
1. Usuário clica "Instalar Mod"
2. Seleciona arquivo (.zip, .7z, .rar)
3. Extrai para staging/<mod-name>/
   ├── Verifica recursão de wrappers (pasta única)
   ├── Identifica required folders do jogo
4. Detecta FOMOD (fomod/ModuleConfig.xml)
   ├── Se tem FOMOD → abre diálogo de configuração
   └── Se não → instala direto
5. Deploy: cria symlinks de staging/<mod-name>/ → Data/
6. Escreve plugins.txt no perfil ativo
7. Symlink do plugins.txt para o prefixo real
```

## FOMOD Parser — Padrões Identificados

### Tags de Step

O XML pode usar `<step>` ou `<installStep>`:

```xml
<installSteps>
  <step name="...">           <!-- formato comum -->
  <installStep name="...">    <!-- também usado (Bijin) -->
</installSteps>
```

### Container de Groups

Groups podem estar diretamente no step ou dentro de `<optionalFileGroups>`:

```xml
<installStep name="Options">
  <optionalFileGroups>              <!-- wrapper comum -->
    <group name="..." type="...">
```

### Dependências / Flags

Dois formatos:

```xml
<!-- Formato 1: conditionFlags + flag (Bijin) -->
<plugin name="Legendary">
  <conditionFlags>
    <flag name="ALL">On</flag>
  </conditionFlags>

<!-- Formato 2: dependencies + flagDependency (tradicional) -->
<plugin name="Legendary">
  <dependencies>
    <flagDependency flag="ALL" value="On" />
  </dependencies>
```

### Type Descriptor

Sempre dentro de `<typeDescriptor>`:

```xml
<typeDescriptor>
  <type name="Optional"/>       <!-- ou Required, Recomended -->
</typeDescriptor>
```

### Files vs Folders

```xml
<!-- Arquivo único -->
<file source="foo.dll" destination="Data/"/>

<!-- Pasta inteira (source → destination) -->
<folder source="meshes\" destination=""/>   /* copia conteúdo para raiz */
<folder source="textures\" destination="textures"/>  /* copia com subpasta */
```

## Deploy — Estratégia

### Bethesda Deploy Helpers

- `plugins.txt` escrito no perfil ativo (`<staging>/<profile>/plugins.txt`)
- Symlink do `plugins.txt` para o prefixo real do Wine
- Symlinks de mod → `Data/` (hardlink ou symlink, configurável)
- Limpeza de stale symlinks antes de recriar
- Suporte a load order via LOOT ou manual

### Amethyst Strategy (SKSE)

Para jogos Steam com script extender:
1. Deploy troca o launcher para apontar pro SKSE
2. Launch via `steam://rungameid/<appId>`
3. Alternativa: `umu-run` com env vars para controle de ambiente

## Launch — Variáveis de Ambiente

```typescript
env.WINEPREFIX              // Prefixo Wine
env.STEAM_COMPAT_DATA_PATH   // compatdata path
env.STEAM_COMPAT_INSTALL_PATH // install path
env.SteamAppId / SteamGameId
env.PROTON_USE_WINED3D       // 1 = WineD3D (evita crash com fullscreen)
```

### Problema Conhecido: Fullscreen + DXVK

RaceMenu (SKSE plugin) crasha com `bFull Screen=1` porque hooka no D3D9 e não trata device reset.

**Soluções:**
| Solução | Como | Efeito |
|---------|------|--------|
| Borderless | `bFull Screen=0` + `bBorderless=1` | Sem device reset, visual fullscreen |
| WineD3D | `PROTON_USE_WINED3D=1` | WineD3D lida com fullscreen sem crash |
| Gamescope | `gamescope -W 1280 -H 720 -- %command%` | Isola em micro-compositor |

### Prioridade de Python (Wine Tools)

Para evitar crash `XInitThreads` do Python 3.10 + NVIDIA:

```typescript
// Ordem correta: system python ANTES do venv
const candidates = [
  "/usr/bin/python3",         // 3.14.6 (funciona)
  getVenvPythonPath(),        // 3.10.15 (crash com NVIDIA + X11)
];
```

## Resolução de Tela

INIs ficam no prefixo Wine em `drive_c/users/steamuser/Documents/My Games/<game>/`:

```ini
[Display]
bFull Screen=1        ; 1=fullscreen, 0=windowed
bBorderless=1         ; 1=borderless windowed (sem device reset)
iSize H=720
iSize W=1280
```

## Conflitos entre Mods

Detecção por plugin (ESP/ESM):
- `useConflictBadges()` retorna `conflictSet` + `conflictDetails`
- UI mostra linha vermelha + tooltip: "Conflito: plugin.esp entre ModX, ModY"
- Baseado em sobreposição de arquivos no deploy

## Checklist para Adicionar Novo Jogo Bethesda

1. Criar `games/<game-id>/` com `index.ts` exportando `create<Game>Module()`
2. Implementar `GameModule` interface:
   - `detect()` — encontra jogo no disco
   - `getDeployTarget()` — pasta Data/
   - `shouldWritePluginsTxt()` — se usa plugins.txt
   - `getScriptExtender()` — se tem SKSE/FOSE/NVSE/OBSE
   - `deploy()` + `restore()` — deploy via bethesda-deploy-helpers
   - `getLaunchExe()` + `getLaunchEnv()` — lançamento
3. Criar `fomod/` com parser específico se necessário
4. Registrar em `games/registry.ts`
5. Adicionar constantes em `<game>.constants.ts`

## Referências

- `app/Catalogo/GameMod/games/skyrim/` — implementação de referência
- `app/Catalogo/GameMod/games/skyrim-se/` — Skyrim Special Edition
- `app/Catalogo/GameMod/games/skyrim-vr/` — Skyrim VR
- `app/Catalogo/GameMod/games/_shared/` — helpers compartilhados (launch, deploy, prefix)
- `app/_main/rpc/fomod/` — parser FOMOD original (genérico, substituído pelo específico)
- `app/Catalogo/GameMod/play/` — pipeline de lançamento (detect, proton, prefix, configs, skse, launch)

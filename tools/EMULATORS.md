# Emulators — Documentacao Completa

> Gestao de emuladores retro/console para Makai Forge. Caminho base: `tools/emulators/`

---

## Estrutura de Diretorios

```
emulators/
├── index.ts              # Barrel export
├── types.ts              # Interfaces TypeScript
├── registry.ts           # Registro master de 31 emuladores
├── installer.ts          # Download, extracao, instalacao, launch
├── updater.ts            # Verificacao de atualizacoes via GitHub API
└── definitions/
    ├── arcade/
    │   └── mame.ts
    ├── computers/
    │   ├── atari800.ts, dosbox-staging.ts, hatari.ts
    │   ├── scummvm.ts, stella.ts
    ├── microsoft/
    │   └── xemu.ts
    ├── multi/
    │   └── mednafen.ts
    ├── nintendo/
    │   ├── bsnes.ts, cemu.ts, dolphin.ts, melonds.ts
    │   ├── mesen.ts, mgba.ts, mupen64plus.ts
    │   ├── ryujinx.ts, snes9x.ts, zsnes.ts
    ├── obscure/
    │   ├── fs-uae.ts, nekop2.ts, quasi88.ts, tic80.ts, vice.ts
    ├── sega/
    │   ├── blastem.ts, flycast.ts, genesis-plus-gx.ts
    └── sony/
        ├── duckstation.ts, pcsx2.ts, ppsspp.ts
        ├── rpcs3.ts, vita3k.ts
```

---

## Arvore Genealogica de Execucao

### FLUXO 1: Instalar Emulador

```
[UI] installRunner(definition, onProgress, onStatus)
  → installer.ts: installRunner()
    ├── 1. Verifica se ja instalado (isInstalled)
    ├── 2. Monta URL de download (repo GitHub ou downloadUrl)
    ├── 3. downloadFile() — HTTP download com arch filtering
    │     └── Suporta: tar.gz, tar.xz, zip, deb, AppImage
    ├── 4. Extrai arquivo
    │     └── Auto-achata diretorios nested
    ├── 5. Para libretro cores: cria wrapper script RetroArch
    └── 6. Salva .version para controle de atualizacao
```

### FLUXO 2: Lançar Jogo

```
[UI] launchGame(runnerId, romPath, onExit)
  → installer.ts: launchGame()
    ├── 1. getRunnerById(runnerId)
    ├── 2. Monta argumentos: definition.launchArgs(romPath)
    ├── 3. spawn(executablePath, args)
    └── 4. onExit callback
```

### FLUXO 3: Verificar Atualizacoes

```
[UI] checkForRunnerUpdates(runnerId?)
  → updater.ts: checkForRunnerUpdates()
    ├── 1. getInstalledVersions()
    ├── 2. Para cada emulador:
    │     ├── Busca ultima release do GitHub API
    │     └── Compara com .version local
    └── 3. Retorna lista de atualizacoes disponiveis
```

---

## Todas as Funcoes Exportadas

### index.ts (Barrel)
| Funcao | Origem | Descricao |
|--------|--------|-----------|
| `allRunnerDefinitions` | registry.ts | Array de 31 RunnerDefinition |
| `getRunnerById(id)` | registry.ts | Busca emulador por ID |
| `getRunnersByCategory(cat)` | registry.ts | Filtra por categoria |
| `installRunner(def, onProgress, onStatus)` | installer.ts | Download + extracao + config |
| `uninstallRunner(runnerId)` | installer.ts | Deleta diretorio do emulador |
| `launchGame(runnerId, romPath, onExit)` | installer.ts | Spawn emulador com ROM |
| `closeRunner(runnerId)` | installer.ts | Kill processo |
| `isInstalled(runnerId)` | installer.ts | Verifica se diretorio existe |
| `getRunnerStatus(def)` | installer.ts | Status completo |
| `getInstalledVersions()` | installer.ts | Mapa de versoes instaladas |
| `checkForRunnerUpdates(runnerId?)` | updater.ts | Compara GitHub vs local |
| `hasUpdatesAvailable()` | updater.ts | Boolean: tem atualizacao? |
| `getRunnersWithUpdates()` | updater.ts | Lista de atualizaveis |
| `shouldCheckForUpdates()` | updater.ts | True se >24h desde ultima check |

---

## Tipos

```typescript
interface RunnerDefinition {
  id: string
  humanName: string
  description: string
  category: RunnerCategory  // "nintendo"|"sony"|"sega"|"arcade"|"computers"|"microsoft"|"multi"|"obscure"
  platforms: string[]
  runnerType?: "standalone" | "libretro"
  libretroCoreId?: string
  repo?: { owner: string; repo: string }
  downloadUrl?: string
  executablePath: string
  launchArgs: (romPath: string) => string[]
  assetPattern?: string
  romSites: RomSite[]
  isAbandoned?: boolean
  isPaid?: boolean
  paidUrl?: string
}

interface RunnerStatus {
  id: string
  isInstalled: boolean
  installedVersion?: string
  latestVersion?: string
  updateAvailable: boolean
  installPath?: string
}
```

---

## Emuladores Registrados (31)

| Categoria | Emuladores |
|-----------|-----------|
| Nintendo | bsnes, cemu, dolphin, melonds, mesen, mgba, mupen64plus, ryujinx, snes9x, zsnes |
| Sony | duckstation, pcsx2, ppsspp, rpcs3, vita3k |
| Sega | blastem, flycast, genesis-plus-gx |
| Arcade | mame |
| Computers | atari800, dosbox-staging, hatari, scummvm, stella |
| Microsoft | xemu |
| Multi | mednafen |
| Obscure | fs-uae, nekop2, quasi88, tic80, vice |

---

## Como se Encaixa no Makai Forge

Modulo separado do fluxo Proton/Wine. Gerencia jogos retro/console (SNES, PS2, GameCube, etc.) — lifecycle completo: encontrar emulador, baixar binario do GitHub, extrair, configurar libretro cores via RetroArch, e lancar ROMs. Update checks usam GitHub API e comparam tags com arquivos `.version`.

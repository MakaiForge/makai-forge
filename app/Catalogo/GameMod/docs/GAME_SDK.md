# Game SDK — Como Adicionar um Jogo

> Guia para quem quer adicionar suporte a um novo jogo no Mods Manager.

---

## Conceito Central: GameModule

Cada jogo e representado por um `GameModule` — um objeto que implementa toda a logica especifica daquele jogo. O registry mapeia IDs para modulos.

```
gameId → getGameModule() → GameModule
```

---

## Estrutura Basica

```
games/
├── registry.ts              # Onde voce registra seu jogo
├── _shared/                 # Funcoes compartilhadas (symlink, filemap, etc)
├── generic/                 # Modulo generico (fallback)
└── meu-jogo/                # Seu novo jogo
    ├── index.ts             # createMeuJogoModule()
    ├── deploy.ts            # logica de deploy (opcional)
    ├── prefix.ts            # DLL overrides, registry, winetricks (opcional)
    ├── launch.ts            # comando de launch (opcional)
    └── routing.ts           # regras de routing customizadas (opcional)
```

---

## Passo 1: Criar o Modulo

```typescript
// games/meu-jogo/index.ts
import { genericModule } from "../generic"
import type { GameModule } from "../_shared/types"

export function createMeuJogoModule(): GameModule {
  const base = genericModule("meu-jogo", "Meu Jogo")

  return {
    ...base,

    // Identidade
    id: "meu-jogo",
    displayName: "Meu Jogo",
    steamAppId: "123456",
    exeName: "MeuJogo.exe",

    // Deploy — para onde vao os mods?
    getDeployTarget: (gamePath) => `${gamePath}/Mods`,

    // Detect — como saber se o jogo existe?
    detect: (gamePath) => {
      return fs.existsSync(path.join(gamePath, "MeuJogo.exe"))
    },

    // DLL Overrides — quais DLLs precisam ser sobrescritas?
    getWineDllOverrides: () => ({
      winmm: "native,builtin",
    }),

    // Launch — como lanca o jogo?
    getLaunchExe: () => "MeuJogo.exe",
    getLaunchArgs: () => [],

    // Frameworks — precisa de algum framework?
    getAutoInstallFrameworks: () => [
      { id: "bepinex", name: "BepInEx", ... }
    ],
  }
}
```

---

## Passo 2: Registrar no Registry

```typescript
// games/registry.ts
import { createMeuJogoModule } from "./meu-jogo"

// Adicionar na lista REGISTRY:
reg("meu-jogo", "Meu Jogo", ["meujogo"], createMeuJogoModule)
```

---

## Interface GameModule

### Identidade (obrigatorio)

| Membro | Tipo | Descricao |
|--------|------|-----------|
| `id` | `string` | ID unico (lowercase, sem espacos) |
| `displayName` | `string` | Nome para exibicao |
| `aliases` | `string[]` | Nomes alternativos para busca |
| `steamAppId` | `string` | ID do Steam |
| `exeName` | `string` | Nome do executavel |

### Deploy (obrigatorio)

| Membro | Descricao |
|--------|-----------|
| `getDeployTarget(gamePath)` | Diretorio alvo (ex: `Data/`, `Mods/`, `BepInEx/plugins`) |
| `deploy(...)` | Funcao de deploy customizada (opcional — usa generic se nao definir) |
| `restore(...)` | Funcao de restore (desfaz deploy) |

### Config (opcional)

| Membro | Descricao |
|--------|-----------|
| `getWineDllOverrides()` | DLLs que precisam ser native,builtin |
| `getWinetricksComponents()` | Componentes para instalar via winetricks |
| `seedRegistry(prefixPath, gamePath)` | Grava chaves no registry Wine |
| `getMyGamesSubpath()` | Subpasta em My Games (Bethesda) |

### Launch (opcional)

| Membro | Descricao |
|--------|-----------|
| `getLaunchExe()` | Executavel alternativo |
| `getLaunchArgs()` | Argumentos extras |
| `getLaunchEnv()` | Variaveis de ambiente extras |

### Frameworks (opcional)

| Membro | Descricao |
|--------|-----------|
| `getAutoInstallFrameworks()` | Frameworks para instalar automaticamente |
| `getExternalTools()` | Ferramentas externas (LOOT, xEdit, etc) |

### Script Extender (opcional)

| Membro | Descricao |
|--------|-----------|
| `getScriptExtender()` | Definicao do SE (SKSE, F4SE, etc) |
| `getScriptExtenderRelease()` | Release para download |

### Comportamento

| Membro | Descricao |
|--------|-----------|
| `defaultLinkMode` | `"symlink"` ou `"hardlink"` |
| `filemapCasing` | `"preserve"` ou `"lower"` |
| `coreBackupEnabled` | Habilita backup antes de deploy |

---

## Exemplos por Nivel de Complexidade

### Simples (Valheim, Factorio, Rimworld)

```
genericModule + deploy target customizado + framework (BepInEx/SMAPI)
```

~50 linhas. So define steamAppId, exeName, getDeployTarget, e frameworks.

### Medio (Cyberpunk 2077, Stardew Valley)

```
genericModule + DLL overrides + framework + routing customizado
```

~100 linhas. Adiciona DLL overrides, winetricks, e regras de routing.

### Complexo (Skyrim, Fallout 4)

```
Modulo completo com prefix, deploy, invalidation, registry, plugins, routing
```

~300+ linhas. Herda do modulo base Skyrim e adiciona variantes (SE, VR, etc).

---

## Funcoes Compartilhadas (_shared/)

Antes de implementar do zero, veja se ja existe:

| Funcao | Arquivo | Para que |
|--------|---------|----------|
| `buildFilemap()` | filemap.ts | Constroi mapa de arquivos |
| `linkAll()` | symlink.ts | Cria symlinks em batch |
| `scanSymlinks()` | symlink.ts | Escaneia symlinks existentes |
| `deployBethesda()` | bethesda-deploy.ts | Deploy generico Bethesda |
| `deployBepInEx()` | bepinex-deploy.ts | Deploy BepInEx |
| `seedBethesdaRegistryWithProton()` | prefix.ts | Registry para Bethesda |
| `writeDummyBsa()` | bethesda-invalidation.ts | Invalidacao de archive |
| `launchViaProton()` | launch.ts | Launch via Proton |
| `launchViaSteam()` | launch.ts | Launch via Steam |

---

## Checklist para Novo Jogo

- [ ] Criar diretorio `games/meu-jogo/`
- [ ] Criar `index.ts` com `createMeuJogoModule()`
- [ ] Definir identidade (id, steamAppId, exeName)
- [ ] Definir deploy target (onde os mods vao)
- [ ] Testar `detect()` com o jogo instalado
- [ ] Registrar em `registry.ts`
- [ ] Se precisar: DLL overrides em `prefix.ts`
- [ ] Se precisar: Frameworks (BepInEx, SMAPI, etc)
- [ ] Se precisar: Script Extender (SKSE, F4SE, etc)
- [ ] Se precisar: Routing customizado
- [ ] Testar: install → deploy → play
- [ ] Rodar `npx tsc --noEmit` para verificar tipos

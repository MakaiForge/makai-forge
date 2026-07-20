# Games — Arquitetura Modular

Cada jogo tem seu próprio módulo que decide **como** mods são detectados, extraídos, deployados e gerenciados. Nada de if/else espalhado.

## Estrutura

```
src/main/games/
├── _shared/              # Utilitários genéricos (qualquer jogo usa)
│   ├── archive.ts        # Extrair .7z/.zip/.rar
│   ├── symlink.ts        # Criar/remover symlinks
│   ├── filemap.ts        # Mapear arquivos do staging
│   └── types.ts          # GameModule interface
│
├── bethesda/             # Base compartilhada: Skyrim, Fallout, Oblivion, etc.
│   ├── index.ts          # GameModule — deploy em Data/ + plugins.txt
│   ├── plugins.ts        # .esp/.esm/.esl read/write + load order
│   ├── bsa.ts            # Extração BSA/BA2
│   ├── eslify.ts         # ESL flag toggle
│   └── tools.ts          # Detecção SSEEdit, FNIS, BodySlide...
│
├── skyrim-se/            # Herda bethesda/ + específico SE
│   ├── index.ts          # GameModule (extends bethesda)
│   └── se.ts             # SKSE64 paths, VR detection
│
├── cyberpunk2077/        # Módulo independente
│   ├── index.ts          # GameModule — deploy em archive/pc/mod
│   └── redmod.ts         # REDmod CLI
│
├── witcher3/
│   ├── index.ts          # GameModule — deploy em mods/ + dlc/
│   └── script-merger.ts  # Fusão de scripts .ws
│
├── minecraft/
│   ├── index.ts          # GameModule — deploy em mods/ (ou .minecraft)
│   └── profiles.ts       # Fabric/Forge/Quilt detection
│
├── valheim/
│   ├── index.ts          # GameModule — deploy em BepInEx/plugins
│   └── bepinex.ts        # Gerenciamento BepInEx
│
├── generic/              # Fallback para jogos sem módulo específico
│   └── index.ts          # Deploy na raiz, loose files
│
├── loader.ts             # Dynamic import por gameId → GameModule
└── registry.ts           # Registro de todos os módulos
```

## Interface GameModule

```typescript
interface GameModule {
  /** ID único do jogo (ex: "skyrim-se", "cyberpunk2077") */
  id: string

  /** Nomes alternativos para detecção */
  aliases: string[]

  /** Detecta se um gamePath pertence a este jogo */
  detect(gamePath: string): boolean

  /** Onde os mods são deployados */
  getDeployTarget(gamePath: string): string

  /** Se escreve plugins.txt */
  shouldWritePluginsTxt(): boolean

  /** Handlers de deploy (antes/durante/depois) */
  onBeforeDeploy?(gamePath: string, stagingDir: string): void
  onAfterDeploy?(gamePath: string, stagingDir: string): void

  /** Handlers de arquivo específico */
  getArchiveHandlers(): ArchiveHandler[]
  getPluginExtensions(): string[]

  /** Script extender detection */
  getScriptExtender(): { pattern: RegExp; installDir: string } | null

  /** External tools específicos do jogo */
  getExternalTools(): ExternalToolDef[]
}
```

## Fluxo

```
Usuário seleciona jogo
  → IPC handler (events/mods/) roteia para loader.ts
    → loader.ts: loadGameModule(gameId) → dynamic import
      → GameModule.deploy() executa lógica específica
        → usa _shared/archive.ts, _shared/symlink.ts quando necessário
```

Camadas:
1. **IPC handlers** (`events/mods/`) — continuam existindo, são finos
2. **Game loader** (`games/loader.ts`) — resolve gameId → GameModule
3. **Game modules** (`games/[id]/`) — lógica específica do jogo
4. **Shared utils** (`games/_shared/`) — código genérico

## O que foi herdado do Amethyst, ModSanity e ProtonForge

| Módulo | Herdado de | Adaptado |
|--------|-----------|----------|
| `bethesda/plugins.ts` | Amethyst + ModSanity | Parse header TES4/TES5 real |
| `bethesda/bsa.ts` | Amethyst | BSA v103/v104/v105 + BA2 |
| `bethesda/tools.ts` | ProtonForge | Lista de 12 tools conhecidas |
| `cyberpunk2077/redmod.ts` | Amethyst | REDmod CLI wrapper |
| `witcher3/script-merger.ts` | Amethyst | Fusão .ws |
| `minecraft/profiles.ts` | Amethyst | Detecção Fabric/Forge/Quilt |
| `_shared/archive.ts` | ProtonForge | 7z/zip/rar com timeout |
| `_shared/symlink.ts` | ProtonForge | Symlink deploy genérico |

## Adicionar um jogo novo

1. Criar `src/main/games/[id]/index.ts` implementando `GameModule`
2. Adicionar ao `registry.ts`
3. (Opcional) Componentes React em `src/renderer/src/games/[id]/`
4. Build ✅

Não precisa editar `core.ts`, `rules.ts`, `mod-exe-launcher.ts` ou qualquer arquivo existente.

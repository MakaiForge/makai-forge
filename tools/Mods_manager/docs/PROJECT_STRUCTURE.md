# Estrutura do Projeto

> Arvore de diretorios completa do Mods Manager.

---

```
Mods_manager/
├── core/                          # Backend Python
│   ├── Games/                     # 28 configs Python por jogo
│   ├── Utils/                     # Utilitarios (deploy, filemap)
│   └── commands/                  # Comandos CLI
│
├── data/
│   └── game-dlls.ts               # GameDllEntry, GameDllCatalog
│
├── docs/
│   └── conflict-resolution/
│
├── events/                        # Handlers IPC (ponte Electron)
│   ├── mod-proton/                # Gestao Proton
│   │   ├── index.ts
│   │   ├── info.ts
│   │   ├── setup.ts
│   │   └── helpers.ts
│   ├── framework-install.ts
│   ├── mod-backup.ts
│   ├── mod-bridge.ts              # Python bridge
│   ├── mod-config.ts              # Config do jogo
│   ├── mod-conflicts.ts
│   ├── mod-deploy.ts              # Install + Deploy (entrada principal)
│   ├── mod-environment.ts
│   ├── mod-eslifier.ts
│   ├── mod-exe-launcher.ts        # Tools externas
│   ├── mod-fomod.ts
│   ├── mod-ini.ts
│   ├── mod-known-games.ts
│   ├── mod-launch.ts
│   ├── mod-load-order.ts          # LOOT
│   ├── mod-media.ts
│   ├── mod-prefix-rpc.ts
│   ├── mod-run-wine-tool.ts
│   ├── mod-storage.ts
│   └── mod-switch-proton.ts
│
├── games/                         # 33 modulos de jogo
│   ├── registry.ts                # getGameModule, etc.
│   ├── generic/index.ts           # Modulo generico
│   ├── _shared/                   # Infraestrutura compartilhada
│   │   ├── types.ts               # Interface GameModule
│   │   ├── filemap.ts
│   │   ├── symlink.ts
│   │   ├── prefix.ts
│   │   ├── launch.ts
│   │   ├── archive.ts
│   │   ├── bepinex-deploy.ts
│   │   ├── bethesda-constants.ts
│   │   ├── bethesda-plugins.ts
│   │   ├── bethesda-archives.ts
│   │   ├── bethesda-deploy.ts
│   │   ├── bethesda-deploy-helpers.ts
│   │   ├── bethesda-invalidation.ts
│   │   └── bethesda-restore.ts
│   ├── skyrim/                    # Skyrim LE (base)
│   ├── skyrim-se/
│   ├── skyrim-vr/
│   ├── fallout3/
│   ├── falloutnv/
│   ├── fallout4/
│   ├── fallout4-vr/
│   ├── oblivion/
│   ├── morrowind/
│   ├── starfield/
│   ├── enderal/
│   ├── enderal-s/
│   ├── larian/                    # BG3
│   ├── cyberpunk2077/
│   ├── valheim/
│   ├── stardewvalley/
│   ├── minecraft/
│   ├── terraria/
│   ├── witcher3/
│   ├── masseffect/
│   ├── rimworld/
│   ├── factorio/
│   ├── satisfactory/
│   ├── bannerlord/
│   ├── xcom2/
│   ├── battletech/
│   ├── kerbalspaceprogram/
│   ├── projectzomboid/
│   ├── thelongdark/
│   ├── subnautica/
│   ├── 7daystodie/
│   ├── donotfeedthemonkeys/
│   ├── dragonageorigins/
│   └── dragonage2/
│
├── play/                          # Flow Play
│   ├── index.ts                   # IPC: modPlayGame, modKillGame
│   ├── play-game.ts               # playGame()
│   ├── types.ts
│   ├── logger.ts
│   ├── activity-logger.ts
│   ├── python.ts                  # runPythonCommand()
│   ├── sevenz.ts                  # get7zPath()
│   └── steps/
│       ├── 01-detect.ts
│       ├── 02-proton.ts
│       ├── 03-prefix.ts
│       ├── 04-configs.ts
│       ├── 05-frameworks.ts
│       ├── 05.5-external-tools.ts
│       ├── 06-skse.ts
│       └── 07-launch.ts
│
├── services/                      # Logica de negocios
│   ├── mod-storage-service.ts
│   ├── mod-deploy/
│   │   ├── core.ts
│   │   ├── inventory.ts
│   │   └── rules.ts
│   ├── install/
│   │   ├── install-orchestrator.ts
│   │   ├── archive-reader.ts
│   │   ├── archive-extractor.ts
│   │   ├── integrity-checker.ts
│   │   ├── meta-writer.ts
│   │   ├── overwrite-check.ts
│   │   ├── strip-prefix.ts
│   │   └── verify-game-ready.ts
│   ├── fomod/
│   │   ├── fomod-parser.ts
│   │   ├── fomod-service.ts
│   │   └── fomod-types.ts
│   ├── detection/index.ts
│   ├── health-check/index.ts
│   ├── environment-scanner.ts
│   ├── framework-installer.ts
│   ├── external-tool-installer.ts
│   ├── skse-downloader.ts
│   ├── steam-library.ts
│   ├── steam-prefix-bridge.ts
│   ├── gog-detection.ts
│   ├── game-dlls-service.ts
│   ├── prefix-validator.ts
│   ├── mod-conflict-service.ts
│   ├── mod-backup-service.ts
│   ├── mod-bridge-service.ts
│   ├── mod-manager-service.ts
│   ├── launch-service.ts
│   ├── plugin-sort-service.ts
│   ├── path-utils.ts
│   ├── storage-keys.ts
│   ├── bridge-context.ts
│   └── scanfix-game.ts
│
├── types/
│   └── install.types.ts
│
├── presets/                        # Hooks React
│   ├── useGameConfig.ts
│   ├── useProfiles.ts
│   ├── useGameDllCatalog.ts
│   ├── GamePresetBar.tsx
│   └── index.ts
│
└── ui/                             # Frontend React
    ├── ModManager.tsx              # COMPONENTE RAIZ
    ├── types/
    ├── utils/
    ├── hooks/
    │   ├── mods/
    │   ├── deploy/
    │   ├── config/
    │   ├── ui/
    │   └── ...
    └── components/
        ├── ModManagerTopBar/
        ├── ModManagerTabs/
        ├── ModListPanel/
        ├── RightPanel/
        ├── ProtonConfigPanel/
        ├── GameConfigPanel/
        ├── GameDetectionWizard/
        ├── HealthBanner.tsx
        ├── LaunchOverlay/
        ├── InstallProgressOverlay/
        ├── InstallResultOverlay.tsx
        ├── BainDialog/
        ├── FomodDialog/
        ├── shared/
        └── Modals/ (13 modais)
```

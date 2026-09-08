# API Reference

> Todas as funcoes, classes e metodos exportados. Referencia tecnica.

---

## Services

### InstallOrchestrator (`services/install/install-orchestrator.ts`)

| Metodo | Parametros | Retorno | Descricao |
|--------|-----------|---------|-----------|
| `install` | `(archivePath, config)` | `InstallResult` | Pipeline completo de install |
| `abort` | `()` | `void` | Aborta install em andamento |
| `getCurrentStage` | `()` | `InstallStage` | Stage atual |

### ModStorageService (`services/mod-storage-service.ts`) — Estatica

| Metodo | Parametros | Retorno | Descricao |
|--------|-----------|---------|-----------|
| `get` | `<T>(key)` | `T \| null` | Le do store |
| `put` | `(key, value)` | `void` | Grava no store |
| `delete` | `(key)` | `void` | Deleta do store |
| `entries` | `(prefix?)` | `[string, unknown][]` | Lista entradas |
| `getAll` | `(prefix?)` | `Record<string, unknown>` | Todas entradas |
| `keys` | `(prefix?)` | `string[]` | Chaves |
| `clear` | `()` | `void` | Limpa store |

### Install Pipeline (`services/install/`)

| Funcao | Arquivo | Parametros | Retorno | Descricao |
|--------|---------|-----------|---------|-----------|
| `readArchiveInfo` | archive-reader.ts | `(archivePath)` | `ArchiveInfo` | Le metadata do 7z |
| `extractWithProgress` | archive-extractor.ts | `(archivePath, targetDir, archiveInfo, ...)` | `ExtractedFile[]` | Extrai com progresso |
| `verifyExtractedFiles` | integrity-checker.ts | `(extracted, archive)` | `VerificationResult` | Compara tamanhos |
| `writeModMeta` | meta-writer.ts | `(options)` | `void` | Grava meta.ini |
| `readModMeta` | meta-writer.ts | `(modDir)` | `Meta \| null` | Le meta.ini |
| `checkOverwrite` | overwrite-check.ts | `(gameId, profile, modName, stagingDir)` | `OverwriteInfo` | Verifica duplicata |
| `detectStripPrefix` | strip-prefix.ts | `(...)` | `string \| null` | Detecta prefixo nested |
| `hasBain` | strip-prefix.ts | `(modDir)` | `boolean` | Detecta BAIN |
| `verifyGameReady` | verify-game-ready.ts | `(gameId)` | `CheckResult` | Verifica se jogo pronto |

### Deploy (`services/mod-deploy/`)

| Funcao | Arquivo | Parametros | Retorno | Descricao |
|--------|---------|-----------|---------|-----------|
| `deploy` | core.ts | `(gameId, profile)` | `DeploymentResult` | Deploy completo |
| `undeployMod` | core.ts | `(gameId, modName, gamePath)` | `void` | Remove deploy |
| `buildFilemap` | core.ts | `(...)` | `FilemapEntry[]` | Mapa de arquivos |
| `restore` | core.ts | `(gameId, gamePath)` | `void` | Restaura estado |
| `detectModType` | inventory.ts | `(stagingDir)` | `ModType` | Detecta tipo |
| `inventoryMod` | inventory.ts | `(stagingDir, modName)` | `ModInventory` | Lista arquivos |
| `getDeployTarget` | rules.ts | `(gameId, gamePath)` | `string` | Diretorio alvo |
| `shouldWritePluginsTxt` | rules.ts | `(gameId)` | `boolean` | Se escreve plugins.txt |

### Environment (`services/`)

| Funcao | Arquivo | Parametros | Retorno | Descricao |
|--------|---------|-----------|---------|-----------|
| `scanEnvironment` | environment-scanner.ts | `(opts)` | `EnvironmentStatus` | Verificacao completa |
| `detectGame` | detection/index.ts | `(gameId)` | `DetectionResult` | Steam/GOG/manual |
| `checkPrefixHealth` | health-check/index.ts | `(gameId, gamePath, prefixPath)` | `HealthReport` | Saude do prefix |
| `autoFixPrefix` | health-check/index.ts | `(gameId, ...)` | `FixResult` | Auto-fix |
| `bridgePrefixToSteam` | steam-prefix-bridge.ts | `(gameId, customPrefixPath, steamAppId)` | `BridgeResult` | Symlink prefix→compatdata |

### Frameworks & Tools (`services/`)

| Funcao | Arquivo | Parametros | Retorno | Descricao |
|--------|---------|-----------|---------|-----------|
| `ensureFrameworks` | framework-installer.ts | `(gameId, gamePath, send)` | `FrameworksResult` | Instala frameworks |
| `installFramework` | framework-installer.ts | `(gameId, framework, gamePath)` | `boolean` | Framework especifico |
| `ensureExternalTools` | external-tool-installer.ts | `(gameId, gamePath, send)` | `ExternalToolsResult` | Instala tools |
| `downloadSkse` | skse-downloader.ts | `(gameId, gamePath, send)` | `SkseResult` | Baixa SKSE |
| `verifySkse` | skse-downloader.ts | `(gamePath)` | `boolean` | Verifica SKSE |

### Steam & Detection (`services/`)

| Funcao | Arquivo | Parametros | Retorno | Descricao |
|--------|---------|-----------|---------|-----------|
| `findSteamAppPath` | steam-library.ts | `(appId)` | `{gamePath, libraryPath} \| null` | Encontra jogo |
| `defaultStagingDir` | steam-library.ts | `(gameId)` | `string` | Staging padrao |
| `findGogGamePath` | gog-detection.ts | `(gameId)` | `string \| null` | Encontra GOG |
| `isValidPrefix` | prefix-validator.ts | `(prefixPath)` | `boolean` | Prefix valido |
| `dllOverridesMatch` | prefix-validator.ts | `(prefixPath, overrides)` | `boolean` | Overrides corretos |

### FOMOD (`services/fomod/`)

| Funcao | Arquivo | Parametros | Retorno | Descricao |
|--------|---------|-----------|---------|-----------|
| `parseFomodXml` | fomod-parser.ts | `(xmlPath)` | `FomodConfig \| null` | Parse XML |
| `resolveFomodFiles` | fomod-parser.ts | `(config, selections)` | `{source, destination}[]` | Resolve arquivos |

**FomodService** (estatica): `findConfig()`, `parse()`, `install()`, `installWithComponents()`, `cleanupNonSelected()`, `captureComponentsRetroactive()`

### Plugin Sort (`services/plugin-sort-service.ts`) — Estatica

| Metodo | Parametros | Descricao |
|--------|-----------|-----------|
| `parseMasters` | `(filePath)` | Parser binario TES4 |
| `sort` | `(pluginNames, pluginPaths)` | Sort topologico |

### Bridge Python (`services/mod-bridge-service.ts`)

| Funcao | Parametros | Descricao |
|--------|-----------|-----------|
| `sendCommand` | `(cmd, args)` | Envia comando ao Python RPC |
| `listGames` | `()` | Lista jogos |
| `deploy` | `()` | Deploy via Python |
| `restore` | `()` | Restore via Python |

### Conflitos (`services/mod-conflict-service.ts`) — Estatica

| Metodo | Parametros | Descricao |
|--------|-----------|-----------|
| `detectConflicts` | `(gameId, stagingDir)` | Detecta conflitos |

### Backup (`services/mod-backup-service.ts`) — Estatica

| Metodo | Parametros | Descricao |
|--------|-----------|-----------|
| `createBackup` | `(gameId, modName)` | Cria backup |
| `restoreBackup` | `(gameId, backupName)` | Restaura |
| `listBackups` | `(gameId)` | Lista |

---

## Play Flow (`play/`)

| Funcao | Arquivo | Parametros | Retorno | Descricao |
|--------|---------|-----------|---------|-----------|
| `playGame` | play-game.ts | `(gameId, send, profile?)` | `PlayResult` | Orquestrador principal |
| `detectGame` | steps/01-detect.ts | `(gameId, send)` | `DetectResult` | Detecta jogo |
| `ensureProton` | steps/02-proton.ts | `(gameId, send, prefixPath?)` | `ProtonInfo` | Encontra/instala Proton |
| `ensurePrefix` | steps/03-prefix.ts | `(gameId, prefixPath, protonPath, ...)` | `PrefixResult` | Cria prefix |
| `applyGameConfigs` | steps/04-configs.ts | `(gameId, gamePath, prefixPath, ...)` | `ConfigsResult` | DLL overrides + registry |
| `ensureGameFrameworks` | steps/05-frameworks.ts | `(gameId, gamePath, send)` | `FrameworksResult` | Frameworks |
| `ensureGameExternalTools` | steps/05.5-external-tools.ts | `(gameId, gamePath, send)` | `ExternalToolsResult` | Tools externas |
| `ensureSkse` | steps/06-skse.ts | `(gameId, gamePath, send)` | `SkseResult` | SKSE |
| `launchGame` | steps/07-launch.ts | `(...)` | `PlayResult` | Lanca jogo |
| `killGameProcess` | steps/07-launch.ts | `()` | `boolean` | Mata processo |
| `get7zPath` | sevenz.ts | `()` | `string` | Caminho do 7z |
| `runPythonCommand` | python.ts | `(pyCommand, pyArgs, env?)` | `PythonResult` | Spawn Python |

---

## Games Registry (`games/registry.ts`)

| Funcao | Parametros | Retorno | Descricao |
|--------|-----------|---------|-----------|
| `getGameModule` | `(gameId, gamePath?)` | `GameModule` | Modulo do jogo |
| `getDeployFunction` | `(gameId)` | `Function` | Funcao de deploy |
| `getRestoreFunction` | `(gameId)` | `Function` | Funcao de restore |
| `getGameInfo` | `(gameId)` | `KnownGameEntry \| null` | Metadata |
| `listKnownGames` | `()` | `KnownGameEntry[]` | Todos jogos |

---

## Shared (`games/_shared/`)

### filemap.ts
| Funcao | Descricao |
|--------|-----------|
| `buildFilemap(...)` | Mapa de arquivos |
| `walkDir(dir)` | Percorre diretorio |
| `getStagingDir(gameId)` | Diretorio staging |
| `findPrefixUsername(prefixPath)` | Username no prefix |

### symlink.ts
| Funcao | Descricao |
|--------|-----------|
| `linkAll(entries, mode)` | Symlinks em batch |
| `scanSymlinks(targetDir)` | Escaneia existentes |
| `createSymlink(source, target)` | Symlink individual |
| `removeDeployedLinks(targetDir, sources)` | Remove symlinks |

### prefix.ts
| Funcao | Descricao |
|--------|-----------|
| `seedBethesdaRegistryWithProton(prefixPath, gamePath, registryName)` | Registry Bethesda |

### launch.ts
| Funcao | Descricao |
|--------|-----------|
| `launchViaSteam(...)` | Launch via Steam |
| `launchViaProton(...)` | Launch via Proton |
| `getSteamLaunchEnv(...)` | Env de launch |

### archive.ts
| Funcao | Descricao |
|--------|-----------|
| `extractArchive(archivePath, targetDir)` | Extrai archive |

### bepinex-deploy.ts
| Funcao | Descricao |
|--------|-----------|
| `deployBepInEx(gamePath, stagingDir)` | Deploy BepInEx |
| `restoreBepInEx(gamePath)` | Restore BepInEx |

### bethesda-deploy.ts
| Funcao | Descricao |
|--------|-----------|
| `deployBethesda(...)` | Deploy Bethesda |

### bethesda-invalidation.ts
| Funcao | Descricao |
|--------|-----------|
| `writeDummyBsa(gamePath)` | Dummy BSA |
| `applyInvalidation(gamePath)` | Invalidacao |
| `setIniKey(gamePath, section, key, value)` | Grava INI |

---

## UI Hooks (`ui/hooks/`)

| Hook | Arquivo | Descricao |
|------|---------|-----------|
| `useMods` | mods/useMods.ts | Gestao da lista de mods |
| `usePlugins` | mods/usePlugins.ts | Gestao de plugins |
| `useInstallOrchestrator` | mods/useInstallOrchestrator.ts | Pipeline de install |
| `useConflictBadges` | mods/useConflictBadges.ts | Deteccao de conflitos |
| `useSortPlugins` | mods/useSortPlugins.ts | Ordenacao LOOT |
| `useDeploy` | deploy/useDeploy.ts | Orquestracao de deploy |
| `useFomod` | deploy/useFomod.ts | Dialog FOMOD |
| `useProtonConfig` | config/useProtonConfig.ts | Painel Proton |
| `useRightPanel` | config/useRightPanel.ts | Abas do painel direito |
| `useLaunchGame` | useLaunchGame.ts | Overlay de launch |
| `useModActions` | useModActions.ts | Remover/deletar/eslify |
| `useHealthCheck` | useHealthCheck.ts | Banner de saude |
| `useProtonSetup` | useProtonSetup.ts | Setup Proton |
| `useBainHandlers` | useBainHandlers.ts | Dialog BAIN |
| `useGameConfig` | presets/useGameConfig.ts | Config do jogo |
| `useProfiles` | presets/useProfiles.ts | Gestao de perfis |

---

## Storage Keys

| Chave | Conteudo |
|-------|----------|
| `game:{gameId}:config` | `{ gamePath, stagingDir, protonPrefix, protonVersion }` |
| `game:{gameId}:profile:{profile}:modlist` | `ModlistEntry[]` |
| `game:{gameId}:profile:{profile}:plugins` | `PluginEntry[]` |
| `game:{gameId}:mod:{modName}:inventory` | `ModInventory` |
| `proton_binary` | Caminho global Proton |
| `external_tools` | Ferramentas externas |
| `game:{gameId}:fomod_selections:{name}` | Selecoes FOMOD |

---

## Tipos (`types/install.types.ts`)

| Tipo | Descricao |
|------|-----------|
| `InstallStage` | Etapa do install (reading, extracting, verifying, etc) |
| `ArchiveEntry` | Entrada no archive |
| `ArchiveInfo` | Metadata do archive |
| `ExtractedFile` | Arquivo extraido |
| `InstallProgress` | Progresso do install |
| `InstallResult` | Resultado final |
| `InstallConfig` | Config do install |
| `VerificationError` | Erro de verificacao |
| `VerificationResult` | Resultado da verificacao |

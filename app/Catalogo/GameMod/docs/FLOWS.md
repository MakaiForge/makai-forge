# Fluxos do Mods Manager

> Cada fluxo e um caminho completo de execucao. De um clique do usuario ao resultado final.

---

## Install

O fluxo mais longo. Extrai o archive, verifica, detecta tipo, e opcionalmente prepara o ambiente antes de fazer deploy.

```
UI: "Install"
  → IPC: installModOrchestrated
    → InstallOrchestrator.install()
      │
      ├── 1. readArchiveInfo()
      │     Le o archive 7z e retorna metadata (lista de arquivos, tamanhos)
      │
      ├── 2. checkOverwrite()
      │     Verifica se o mod ja existe no staging (pede confirmacao ao usuario)
      │
      ├── 3. extractWithProgress()
      │     Extrai o archive para ~/Games/Mods/{gameId}/staging/
      │     Reporta progresso por arquivo
      │
      ├── 4. verifyExtractedFiles()
      │     Compara tamanhos dos arquivos extraidos com o archive original
      │
      ├── 5. detectModType()
      │     Identifica se e FOMOD, BAIN, SKSE, ou generico
      │
      ├── 6. inventoryMod()
      │     Lista arquivos relevantes (.esp, .dll, .bsa, .ini, etc)
      │
      ├── 7. hasBain()
      │     Verifica se tem estrutura BAIN (Bethesda Archive INstaller)
      │
      ├── 8. writeModMeta()
      │     Grava meta.ini no diretorio do mod
      │
      ├── 9. ModStorageService.put()
      │     Salva o mod no store JSON
      │
      ├── 10. prepareGameEnvironment() [OPCIONAL]
      │     a. scanEnvironment()      → verifica ambiente
      │     b. ensurePrefix()         → cria prefix Wine se nao existe
      │     c. bridgePrefixToSteam()  → symlink compatdata
      │     d. applyGameConfigs()     → DLL overrides + registry
      │     e. ensureGameFrameworks() → BepInEx, SMAPI, etc.
      │     f. ensureSkse()           → baixa SKSE se necessario
      │
      └── 11. deploy()
            Move os mods do staging pro jogo via symlinks
```

**Resultado**: mod extraído no staging, meta gravada, e opcionalmente ambiente do jogo preparado e deploy feito.

---

## Play

O orquestrador principal. Prepara TUDO que o jogo precisa e lanca.

```
UI: "Play"
  → IPC: modPlayGame
    → playGame()
      │
      ├── 1. Le config do jogo (gamePath, prefix, proton)
      │
      ├── 2. scanEnvironment()
      │     Verifica 23 campos do ambiente
      │
      ├── 3. ensureProton()
      │     Encontra ou instala a versao Proton correta
      │     (recomendacao via Python RPC, download se necessario)
      │
      ├── 4. ensurePrefix()
      │     Cria o prefix Wine/Proton via 4 estrategias:
      │     umu-run → wineboot → proton wineboot → proton run
      │
      ├── 5. bridgePrefixToSteam()
      │     Cria symlink do prefix customizado para compatdata Steam
      │
      ├── 6. applyGameConfigs()
      │     - DLL overrides no user.reg (winmm=native, version=native, etc)
      │     - Winetricks (vcrun2022, dxvk, d3dcompiler_47)
      │     - Registry Bethesda (Installed Path em system.reg)
      │
      ├── 7. ensureGameFrameworks()
      │     Instala frameworks especificos do jogo:
      │     BepInEx (Valheim), SMAPI (Stardew), CET+CET (Cyberpunk), etc.
      │
      ├── 8. ensureGameExternalTools()
      │     Instala ferramentas externas: LOOT, xEdit, etc.
      │
      ├── 9. ensureSkse()
      │     Baixa SKSE/SKSE64/F4SE/OBSE conforme o jogo
      │
      ├── 10. deploy()
      │      Move mods do staging para o jogo via symlinks
      │
      └── 11. launchGame()
             Lanca o jogo via Proton/umu-run/Steam
             Monitora o processo
```

**Resultado**: jogo rodando com todos os mods, configs, e frameworks funcionando.

---

## Deploy

Versao simplificada — so move mods do staging pro jogo, sem preparar ambiente.

```
UI: "Deploy"
  → IPC: deployMods
    │
    ├── Le config do jogo (gamePath, stagingDir)
    │
    ├── getDeployFunction() → retorna a funcao correta pro jogo
    │
    └── deployFn()
          ├── Le modlist do store
          ├── Constroi filemap (quais arquivos vao pra onde)
          ├── Escaneia symlinks existentes (evita duplicar)
          └── linkAll() — cria symlinks em batches de 16
```

---

## Scan Environment

Verificacao completa do estado do ambiente. Roda automaticamente ao selecionar um jogo.

```
UI: ao selecionar jogo (ou manual)
  → scanEnvironment()
    │
    ├── Le config do jogo
    ├── Se nao tem config, detectGame() busca jogo e prefix
    │   ├── Steam: compatdata/{appId}/pfx/
    │   ├── GOG: ~/Games/Prefix/{slug}/
    │   └── Manual: scan de diretorios conhecidos
    │
    ├── findExistingPrefix() busca prefix em有多处:
    │   ├── Steam compatdata (se steamAppId + libraryPath conhecidos)
    │   ├── Scan de todas as Steam libraries
    │   └── Default prefix dir (~/Games/Prefix/{slug}/)
    │
    ├── Verifica se o prefix e valido (user.reg, system.reg, drive_c, dosdevices)
    ├── Verifica se DLL overrides estao corretos
    ├── Verifica se frameworks estao instalados
    ├── Verifica se SKSE esta presente
    └── Retorna status com 23 campos
```

**Usado por**: health check, antes do install, antes do play.

---

## Kill Game

Mata o processo do jogo e processos órfãos.

```
UI: "Kill"
  → IPC: modKillGame
    → killGameProcess()
      ├── Mata o processo principal
      └── killStaleWineserver() — mata wineserver se travou
```

---

## FOMOD

Instalacao guiada de mods FOMOD (com interface de selecao de componentes).

```
UI: apos install de mod FOMOD
  → parseFomod()
    ├── Encontra config.xml/modconfig.xml
    └── Parse XML → arvore de etapas/grupos/opcoes

UI: usuario seleciona componentes
  → installFomod()
    ├── resolveFomodFiles() — quais arquivos copiar
    ├── Copia arquivos selecionados pro staging
    └── cleanupNonSelected() — remove nao selecionados
```

---

## LOOT Plugin Sort

Ordena plugins (.esp/.esm) usando LOOT (Load Order Optimisation Tool).

```
UI: "Sort"
  → IPC: modLoadOrderSort
    ├── Envia para Python RPC (LOOT)
    ├── PluginSortService.sort()
    │   ├── parseMasters() — le headers TES4 dos .esp
    │   └── Sort topologico baseado em master requirements
    └── Atualiza ordem no store
```

---

## Backup / Restore

```
UI: "Backup"
  → createBackup()
    ├── Copia arquivos do staging para diretorio de backup
    └── Grava metadata no store

UI: "Restore"
  → restoreBackup()
    ├── Le backup do diretorio
    └── Copia de volta pro staging
```

---

## Proton Switch

Troca a versao Proton de um jogo.

```
UI: trocar Proton
  → IPC: modSwitchProton
    ├── Valida nova versao
    ├── Atualiza config do jogo no store
    └── Proximo Play usa a nova versao
```

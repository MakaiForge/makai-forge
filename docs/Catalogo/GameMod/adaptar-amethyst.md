# Plano: Adaptar Funcionalidades do Amethyst ao Makai Forge

**Objetivo:** Tornar o Mod Manager do Makai Forge tão capaz quanto o Amethyst para instalar mods em qualquer jogo, preservando a arquitetura Electron/React/TypeScript.

**Data:** 2026-07-12 (atualizado)

---

## 1. Análise Comparativa

### 1.1 O que o Amethyst faz que nós NÃO fazemos

| # | Feature | Amethyst | Makai Forge | Prioridade |
|---|---------|----------|-------------|-----------|
| 1 | **Custom Routing Rules** | Sim — `CustomRule` por arquivo/pasta, mapeia arquivos pra destinos diferentes no game root | **NÃO** — todos os games usam deploy genérico (symlink flat) | CRÍTICO |
| 2 | **Cyberpunk deploy multi-pasta** | `archive/pc/mod`, `bin/`, `r6/`, `red4ext/` | `deployDirs` definido mas é dead code — deploy vai pro root | ALTA |
| 3 | **Witcher 3 routing** | `_route_path()` scanneia segments → `mods/`, `dlc/`, root | Deploy flat pra `{gamePath}/mods/` — DLCs ignoradas | ALTA |
| 4 | **BG3 Mods_Core pattern** | `Mods/ → Mods_Core/`, deploy .paks flat, gera `modsettings.lsx` | Deploy symlink genérico — sem geração de modsettings | MÉDIA |
| 5 | **Hardlink support** | LinkMode.HARDLINK, SYMLINK, ou COPY — user escolhe | Symlink hardcoded — LinkMode existe mas é dead param | ALTA |
| 6 | **Deploy restore completo** | `restore()` limpa TUDO, restaura vanilla de Core backup | Symlinks são removidos mas não há Core backup real | MÉDIA |
| 7 | **Framework auto-install** | BepInEx, SMAPI, CET — wizard com download automático | Definido como check mas sem auto-install | **CRÍTICO** |
| 8 | **Case-insensitive path resolution** | `_resolve_src_case()`, `_resolve_dst_case()` | `stripWrapperFolders()` genérico — sem resolution case | ALTA |

### 1.2 O que nós fazemos que o Amethyst NÃO faz

| Feature | Makai Forge | Amethyst |
|---------|-------------|----------|
| **Play pipeline** | 8-step: detect → proton → prefix → DLLs → registry → deploy → SKSE → launch | Não lança jogos — só deploy |
| **Proton/Wine management** | Download, prefix creation, winetricks, umu-run | Prefix manager básico |
| **Makaitricks** | 55 verbs de instalação de componentes Windows | Protontricks manual |
| **CompatFlow** | Handler de .exe/.msi | Não existe |
| **React UI moderna** | SCSS, virtualized lists, drag-and-drop | CustomTkinter (funcional mas básico) |

---

## 2. Mapa Completo: Frameworks por Jogo

### 2.1 Status Atual (o que já funciona)

| Jogo | Script Extender | Auto-Download | Deploy | Play |
|------|----------------|---------------|--------|------|
| Skyrim LE | SKSE | ✅ skse_1_07_03.7z | ✅ Data/ | ✅ umu-run |
| Skyrim SE | SKSE64 | ✅ skse64_2_02_06.7z | ✅ Data/ | ✅ umu-run |
| Skyrim VR | SKSEVR | ✅ skse64_2_02_06.7z | ✅ Data/ | ✅ umu-run |
| Enderal | SKSE (LE) | ✅ skse_1_07_03.7z | ✅ Data/ | ✅ umu-run |
| Enderal SE | SKSE64 | ✅ skse64_2_02_06.7z | ✅ Data/ | ✅ umu-run |
| Oblivion | OBSE | ✅ obse_21_0.7z | ✅ Data/ | ✅ umu-run |
| Morrowind | MWSE | ✅ MWSE-2.1.7z | ✅ Data Files/ | ✅ umu-run |
| Fallout 3 | FOSE | ✅ fose_4_2_2.7z | ✅ Data/ | ✅ umu-run |
| Fallout NV | NVSE | ✅ nvse_6_2_4.7z | ✅ Data/ | ✅ umu-run |
| Fallout 4 | F4SE | ✅ fose_0_6_21.7z | ✅ Data/ | ✅ umu-run |
| Fallout 4 VR | F4SEVR | ✅ f4sevr_0_2_0.7z | ✅ Data/ | ✅ umu-run |
| Starfield | SFSE | ✅ sfse_0_2_6.7z | ✅ Data/ | ✅ umu-run |

**12/34 jogos com pipeline completo.**

### 2.2 Frameworks Necessários (os que FALTAM)

| Jogo | Framework | O que precisa | URL de Download | Status |
|------|-----------|---------------|-----------------|--------|
| **Valheim** | BepInEx | `BepInExPack_Valheim.zip` | `https://valheim.thunderstore.io/package/denikson/BepInExPack_Valheim/` | ❌ Nenhum auto-download |
| **Subnautica** | BepInEx | `BepInExPack_Subnautica.zip` | `https://subnautica.thunderstore.io/package/denikson/BepInExPack_Subnautica/` | ❌ Nenhum auto-download |
| **Stardew Valley** | SMAPI | `StardewValleyMAPI-3.x.x.zip` | `https://github.com/Pathoschild/SMAPI/releases` | ❌ Nenhum auto-download |
| **Cyberpunk 2077** | CET + RED4ext | `CET.zip` + `RED4ext.zip` | GitHub releases (cesm2020/CET, wghost/RED4ext) | ❌ Nenhum auto-download |
| **BG3** | BG3 Script Extender | `BG3ScriptExtender.zip` | `https://github.com/Norbyte/bg3se/releases` | ❌ Nenhum auto-download |
| **Terraria** | tModLoader | `tModLoader.zip` | `https://tmodloader.net/` ou Steam DLC | ❌ Nenhum auto-download |
| **Minecraft** | Fabric/Forge | `.jar` installer | `https://fabricmc.net/` / `https://files.minecraftforge.net/` | ❌ Nenhum auto-download |
| **Satisfactory** | SML | `SML.zip` | `https://ficsit.app/` | ❌ Nenhum auto-download |

### 2.3 Jogos que NÃO precisam de framework (deploy direto)

RimWorld, Factorio, 7 Days to Die, Bannerlord, BattleTech, Do Not Feed Monkeys, Dragon Age: Origins, Dragon Age II, KSP, Mass Effect, Project Zomboid, The Long Dark, XCOM 2, Witcher 3, Generic

**15 jogos funcionam sem framework.**

### 2.4 Resumo

| Categoria | Jogos | Status |
|-----------|-------|--------|
| **Pipeline completo** | 12 Bethesda | ✅ Funciona |
| **Precisa framework** | 8 (BepInEx, SMAPI, CET, BG3SE, tModLoader, SML) | ❌ Sem auto-download |
| **Deploy direto** | 15 (sem framework necessário) | ⚠️ Só falta routing |

---

## 3. Arquitetura Atual vs. Alvo

### 3.1 Arquitetura Atual (Makai Forge)

```
GameModule {
  deployTarget: string          // ex: "mods" ou "BepInEx/plugins"
  customRoutingRules: []        // SEMPRE VAZIO
  stripPrefixes: () => []       // genérico
}
    ↓
deployGeneric() → buildFilemap() → symlinkAll()
    ↓
Symlink flat: staging/ → gamePath/deployTarget/
```

### 3.2 Arquitetura Alvo (inspirada Amethyst)

```
GameModule {
  deployTarget: string          // pasta principal (ex: "Data")
  customRoutingRules: [         // regras de roteamento por arquivo
    { dest: "archive/pc/mod", extensions: [".archive"], flatten: true },
    { dest: "bin/x64/plugins", folders: ["bin"], flatten: true },
  ]
  frameworks: [                 // frameworks pra auto-install
    { name: "BepInEx", url: "...", detector: "BepInEx/core/..." }
  ]
  stripPrefixes: () => [...]    // por jogo
  postDeploy?: () => void       // hook pós-deploy
}
    ↓
ensureFrameworks() → download + extract + install
    ↓
deployWithRouting() →
  1. Restaurar vanilla (Core backup)
  2. Aplicar custom routing rules
  3. Deploy filemap pro destino principal
  4. Preencher gaps do Core
  5. Post-deploy hooks (modsettings.lsx, menu files, etc.)
    ↓
Symlink/Hardlink/Copy: staging/ → gamePath/{dest}
```

---

## 4. Fases de Implementação

### Fase 0: Fundação — LinkMode + Core Backup (1-2 dias)

**Objetivo:** Permitir que o deploy use hardlink, symlink, ou copy — e tenha backup vanilla.

#### Tasks
- [ ] `types.ts`: Tornar `LinkMode` funcional — adicionar `HARDLINK`, `SYMLINK`, `COPY`
- [ ] `symlink.ts`: Aceitar `mode` param em vez de hardcoded symlink
- [ ] `_shared/deploy-helpers.ts`: Criar `moveToCore()` + `restoreCore()` (copiar padrão Amethyst)
- [ ] `GameModule`: Adicionar prop `deployMode: "symlink" | "hardlink" | "copy"` com default
- [ ] `GameModule`: Adicionar prop `coreBackupEnabled: boolean` com default `true`
- [ ] Salvar deploy mode no storage: `game:{gameId}:config.deployMode`

#### Testes
```
1. Selecionar "hardlink" no deploy dialog → deploy usa hardlinks
2. Selecionar "symlink" → deploy usa symlinks
3. Selecionar "copy" → deploy usa cópias
4. Deploy com Core backup → pasta {Data}_Core criada
5. Restore → pasta {Data}_Core restaurada
6. Verificar que hardlink funciona (mesmo FS)
7. Verificar fallback pra symlink (cross-device)
```

---

### Fase 1: Custom Routing Rules (3-4 dias)

**Objetivo:** Permitir que cada jogo defina regras de roteamento de arquivos.

#### Tasks
- [ ] `types.ts`: Definir `CustomRule` interface:
  ```typescript
  interface CustomRule {
    dest: string;              // destino relativo ao game root
    extensions?: string[];     // filtrar por extensão
    folders?: string[];        // filtrar por pasta top-level
    filenames?: string[];      // filtrar por nome de arquivo
    flatten?: boolean;         // achatar (só filename, sem subpastas)
    loose_only?: boolean;      // só arquivos soltos (sem pasta pai)
    to_prefix?: boolean;       // deploy no prefix, não no game
  }
  ```
- [ ] `deploy-with-routing.ts`: Nova função que:
  1. Lê filemap
  2. Para cada entrada, verifica se matching uma `CustomRule`
  3. Se match → deploy pro `rule.dest` em vez do destino padrão
  4. Se não match → deploy pro destino padrão
  5. Return: `{ routed: Map<rule, count>, default: count }`
- [ ] Integrar no `deployGeneric()`: chamar `deployWithRouting()` quando `customRoutingRules.length > 0`
- [ ] Jogos existentes: adicionar `customRoutingRules` vazios (manter compatibilidade)

#### Testes
```
1. Criar mock game com 2 routing rules → verificar arquivos vão pro destino certo
2. Arquivo sem match → vai pro destino padrão
3. Flatten: pasta/a/b.txt → a/b.txt no destino (não pasta/a/b.txt)
4. loose_only: arquivo solto é routado, arquivo dentro de pasta não é
5. extensions: .dll routado, .txt não routado
6. Deploy sem routing rules → comportamento igual ao anterior
```

---

### Fase 2: Framework Auto-Install — Valheim, Subnautica, BG3, Cyberpunk, Stardew (3-4 dias)

**Objetivo:** Auto-download e instalação dos frameworks que cada jogo precisa pra mods funcionarem.

#### 2.1 O Problema

Hoje, quando o usuário clica "Play" num jogo como Valheim:
1. SKSE step: "⏭️ Jogo sem script extender conhecido" → pula
2. BepInEx **não existe** no game root
3. Mods estão em `BepInEx/plugins/` mas BepInEx não foi instalado
4. Jogo abre mas mods não carregam

**Solução:** Antes do deploy, verificar e instalar frameworks automaticamente.

#### 2.2 Interface do Framework

```typescript
// games/_shared/types.ts — adicionar ao GameModule
interface GameModule {
  // ...existente...

  /** Frameworks que o jogo precisa pra mods funcionarem */
  getFrameworks?: () => FrameworkDef[];
}

interface FrameworkDef {
  /** Nome exibido ao usuário */
  name: string;
  /** URL de download direto (zip/7z) */
  downloadUrl: string;
  /** Keywords pra detectar se já está instalado */
  detector: {
    /** Arquivo que deve existir no game root se instalado */
    file: string;              // ex: "BepInEx/core/BepInEx.Preloader.dll"
    /** Ou pasta que deve existir */
    folder?: string;           // ex: "BepInEx"
  };
  /** Pasta dentro do zip que contém os arquivos (se houver) */
  innerFolder?: string;
  /** Arquivos pra chmod +x após extrair */
  chmodFiles?: string[];
  /** Pós-install: mover arquivos pra locais específicos */
  postInstall?: (gamePath: string) => Promise<void>;
}
```

#### 2.3 Implementação por Jogo

**a) Valheim**
```typescript
getFrameworks: () => [{
  name: "BepInExPack",
  downloadUrl: "https://valheim.thunderstore.io/package/denikson/BepInExPack_Valheim/5.4.1100/BepInExPack_Valheim-5.4.1100.zip",
  detector: { file: "BepInEx/core/BepInEx.Preloader.dll", folder: "BepInEx" },
  innerFolder: "BepInExPack_Valheim",
  chmodFiles: ["start_game_bepinex.sh"],
}]
```

**b) Subnautica**
```typescript
getFrameworks: () => [{
  name: "BepInExPack",
  downloadUrl: "https://subnautica.thunderstore.io/package/denikson/BepInExPack_Subnautica/5.4.1100/BepInExPack_Subnautica-5.4.1100.zip",
  detector: { file: "BepInEx/core/BepInEx.Preloader.dll", folder: "BepInEx" },
  innerFolder: "BepInExPack_Subnautica",
}]
```

**c) Stardew Valley (SMAPI)**
```typescript
getFrameworks: () => [{
  name: "SMAPI",
  downloadUrl: "https://github.com/Pathoschild/SMAPI/releases/download/4.1.10/SMAPI-4.1.10.zip",
  detector: { file: "StardewModdingAPI.exe" },
  postInstall: async (gamePath) => {
    // SMAPI precisa de install no Windows via wine
    // No Linux, o SMAPI é .NET e precisa de proton/wine pra instalar
    // Simplificação: extrair os DLLs e copiar pro game root
  },
}]
```

**d) Cyberpunk 2077 (CET + RED4ext)**
```typescript
getFrameworks: () => [
  {
    name: "CET",
    downloadUrl: "https://github.com/cesm2020/CET/releases/download/1.32.0/CET.zip",
    detector: { file: "bin/x64/version.dll" },
  },
  {
    name: "RED4ext",
    downloadUrl: "https://github.com/wghost/RED4ext/releases/download/0.5.4/RED4ext.zip",
    detector: { file: "red4ext/red4ext.dll", folder: "red4ext" },
  },
]
```

**e) BG3 Script Extender**
```typescript
getFrameworks: () => [{
  name: "BG3 Script Extender",
  downloadUrl: "https://github.com/Norbyte/bg3se/releases/download/v1.0.29/bg3se_2024_07_25.zip",
  detector: { file: "bin/bg3se_loader.dll", folder: "bin" },
}]
```

**f) Satisfactory (SML)**
```typescript
getFrameworks: () => [{
  name: "SML",
  downloadUrl: "https://github.com/satisfactorymodding/SML/releases/download/3.7.1/SML-3.7.1.zip",
  detector: { file: "SML/Bootstrap.dll", folder: "SML" },
}]
```

**g) Terraria (tModLoader)**
```typescript
// tModLoader é distribuído via Steam Workshop — mais complexo
// Abordagem: detectar se já está instalado, senão dar instruções
getFrameworks: () => [{
  name: "tModLoader",
  downloadUrl: "https://github.com/tModLoader/tModLoader/releases/download/v0.8.5/tModLoader.zip",
  detector: { file: "tModLoader.exe" },
}]
```

**h) Minecraft (Fabric)**
```typescript
// Fabric/Forge são Java-based — instalação diferente
// Abordagem: detectar, senão dar instruções pro usuário
getFrameworks: () => [{
  name: "Fabric",
  downloadUrl: "https://maven.fabricmc.net/net/fabricmc/fabric-installer/1.0.0/fabric-installer-1.0.0.jar",
  detector: { folder: ".fabric" },
  // Nota: precisa de Java pra rodar o .jar installer
}]
```

#### 2.4 Serviço de Framework Install

```typescript
// services/framework-installer.ts
export async function ensureFramework(
  gamePath: string,
  framework: FrameworkDef,
  send: SendProgress,
): Promise<boolean> {
  // 1. Verificar se já instalado
  const installed = framework.detector.folder
    ? fs.existsSync(path.join(gamePath, framework.detector.folder))
    : fs.existsSync(path.join(gamePath, framework.detector.file));

  if (installed) {
    send("framework", `✅ ${framework.name} encontrado`, "done");
    return true;
  }

  // 2. Baixar
  send("framework", `⬇️ Baixando ${framework.name}...`, "working");
  const zipPath = path.join(app.getPath("temp"), `${framework.name}.zip`);
  await downloadFile(framework.downloadUrl, zipPath);

  // 3. Extrair
  send("framework", `📦 Extraindo ${framework.name}...`, "working");
  const extractDir = path.join(app.getPath("temp"), framework.name);
  await extractArchive(zipPath, extractDir);

  // 4. Copiar pro game root (com innerFolder se houver)
  const sourceDir = framework.innerFolder
    ? path.join(extractDir, framework.innerFolder)
    : extractDir;
  await copyDir(sourceDir, gamePath);

  // 5. Post-install (chmod, etc.)
  if (framework.chmodFiles) {
    for (const file of framework.chmodFiles) {
      const fullPath = path.join(gamePath, file);
      if (fs.existsSync(fullPath)) {
        fs.chmodSync(fullPath, 0o755);
      }
    }
  }

  if (framework.postInstall) {
    await framework.postInstall(gamePath);
  }

  send("framework", `✅ ${framework.name} instalado`, "done");
  return true;
}
```

#### 2.5 Integração no Play Pipeline

```typescript
// play/steps/05-frameworks.ts — NOVO step (antes de SKSE)
import { ensureFramework } from "@mods/services/framework-installer";

export async function ensureFrameworks(
  gameId: string,
  gamePath: string,
  send: SendProgress,
): Promise<void> {
  const mod = getGameModule(gameId, gamePath);
  const frameworks = mod?.getFrameworks?.();

  if (!frameworks || frameworks.length === 0) {
    send("frameworks", "⏭️ Nenhum framework necessário", "done");
    return;
  }

  for (const fw of frameworks) {
    await ensureFramework(gamePath, fw, send);
  }
}
```

#### 2.6 Ordem do Play Pipeline (atualizada)

```
1. detect     — Descobrir caminho do jogo
2. proton     — Verificar/baixar Proton
3. prefix     — Criar/completar Wine prefix
4. DLLs       — Instalar vcrun, d3dcompiler, etc.
5. registry   — Chaves de registro (Bethesda)
6. frameworks — ⚠️ NOVO: Baixar BepInEx, SMAPI, CET, etc.
7. deploy     — Symlink mods pro game
8. skse       — Baixar script extender (se Bethesda)
9. launch     — Iniciar jogo via umu-run/proton
```

#### 2.7 IPC Handler

```typescript
// events/framework-install.ts
ipcMain.handle("installFramework", async (_event, gameId: string) => {
  const config = await modsStore.get(`game:${gameId}:config`);
  const gamePath = config?.gamePath;
  if (!gamePath) throw new Error("Game path not configured");

  const mod = getGameModule(gameId, gamePath);
  const frameworks = mod?.getFrameworks?.();
  if (!frameworks || frameworks.length === 0) return { installed: false };

  for (const fw of frameworks) {
    await ensureFramework(gamePath, fw, (msg, type) => {
      _event.sender.send("onModLaunchProgress", { step: "frameworks", message: msg, type });
    });
  }

  return { installed: true };
});
```

#### 2.8 UI — Botão "Install Framework" no GamePresetBar

Quando o jogo tem frameworks mas não estão instalados, mostrar botão "Install Framework" antes do "Play".

#### Testes
```
1. Valheim sem BepInEx → botão "Install BepInEx" aparece
2. Click → download BepInExPack_Valheim.zip → extract → copy pro game root
3. start_game_bepinex.sh tem +x após install
4. Já instalado → botão desabilitado / status verde
5. Subnautica → mesmo fluxo BepInEx
6. Stardew Valley → SMAPI download
7. Cyberpunk → CET + RED4ext downloads
8. BG3 → BG3 Script Extender download
9. Download falhou → retry + error message
10. Play pipeline roda ensureFrameworks automaticamente
```

---

### Fase 3: Cyberpunk 2077 Deploy Correto (1 dia)

**Objetivo:** Cyberpunk deploya mods nas pastas corretas.

#### Tasks
- [ ] `cyberpunk2077/index.ts`: Ativar `customRoutingRules`:
  ```typescript
  customRoutingRules: () => [
    { dest: "archive/pc/mod", extensions: [".archive"], flatten: true, loose_only: true },
    { dest: "bin/x64/plugins", filenames: ["*.asi", "*.dll"], loose_only: true },
    { dest: "r6/scripts", extensions: [".reds"], loose_only: true },
    { dest: "r6/tweaks", extensions: [".tweak"], loose_only: true },
  ]
  ```
- [ ] `cyberpunk2077/constants.ts`: Remover `deployDirs` dead code
- [ ] Adicionar `filemap_casing: "lower"` — Cyberpunk é case-sensitive
- [ ] Adicionar `mod_required_top_level_folders: ["archive", "bin", "r6", "red4ext"]`
- [ ] Adicionar `filemap_exclude_unknown_top_level: true`

#### Testes
```
1. Instalar mod Cyberpunk com .archive → deploya em archive/pc/mod/
2. Instalar mod com .reds scripts → deploya em r6/scripts/
3. Instalar mod com bin/ → deploya em bin/x64/plugins/
4. Mod com pasta "screenshots" → ignorada (exclude_unknown_top_level)
5. Mod case-insensitive ("Archive" vs "archive") → unificado pra "archive"
```

---

### Fase 4: Witcher 3 Routing (1-2 dias)

**Objetivo:** Witcher 3 detecta e roteia mods/dLCs automaticamente.

#### Tasks
- [ ] `witcher3/index.ts`: Adicionar `customRoutingRules`:
  ```typescript
  customRoutingRules: () => [
    { dest: "mods", folders: ["mods"], flatten: false },
    { dest: "dlc", folders: ["dlc"], flatten: false },
    { dest: "", flatten: false },  // root pra bin/, content/, etc.
  ]
  ```
- [ ] `witcher3/index.ts`: Adicionar `mod_install_prefix: "mods"` — prefixo automático
- [ ] `witcher3/index.ts`: Adicionar `mod_required_top_level_folders: ["mods", "dlc", "bin", "content"]`
- [ ] `witcher3/deploy.ts`: Implementar post-deploy `update_menu_filelists()`

#### Testes
```
1. Instalar mod Witcher 3 com pasta mods/ → deploya em {game}/mods/
2. Instalar DLC → deploya em {game}/dlc/
3. Instalar mod com bin/ (script merger) → deploya em {game}/bin/
4. Mod sem pasta recognized → warning dialog
5. Script Merger funciona com mods deployed
```

---

### Fase 5: BepInEx Games Deploy (1-2 dias)

**Objetivo:** Subnautica, Valheim etc. deployam corretamente.

#### Tasks
- [ ] Criar `games/_shared/bepinex-deploy.ts`:
  ```typescript
  function deployBepInEx(gamePath, stagingPath, filemap, rules, mode) {
    // 1. Mover BepInEx/plugins/ → BepInEx/plugins_Core/
    // 2. Deploy routing rules (winhttp.dll, config/, etc.)
    // 3. Deploy filemap → BepInEx/plugins/
    // 4. Preencher gaps do Core
  }
  ```
- [ ] Subnautica, Valheim, Lethal Company, TCG: adicionar `customRoutingRules`:
  ```typescript
  customRoutingRules: () => [
    { dest: "", filenames: ["winhttp.dll", "version.dll"], loose_only: true },
    { dest: "BepInEx", folders: ["config", "core", "patchers"], loose_only: true },
    { dest: "BepInEx/plugins", folders: ["plugins"], flatten: true, loose_only: true },
  ]
  ```
- [ ] Valheim: post-deploy chmod +x em `start_game_bepinex.sh`

#### Testes
```
1. Instalar BepInEx mod (Subnautica) → deploya em BepInEx/plugins/
2. winhttp.dll → deploya em game root
3. Mod com config/ → deploya em BepInEx/config/
4. Restore → BepInEx/plugins_Core/ restaurado
5. Valheim: start_game_bepinex.sh tem +x após deploy
```

---

### Fase 6: BG3 Deploy Correto (2-3 dias)

**Objetivo:** BG3 deploya .paks no Larian Mods folder e gera modsettings.lsx.

#### Tasks
- [ ] `larian/index.ts`: Override `getModDataPath()` → Larian AppData Mods folder
- [ ] `larian/index.ts`: `mod_install_extensions: [".pak"]` — só .paks
- [ ] `larian/index.ts`: `mod_required_top_level_folders: ["data", "bin", "generated", "public", "video", "mods"]`
- [ ] `larian/deploy.ts`: Implementar Mods_Core pattern
- [ ] `larian/deploy.ts`: Gerar `modsettings.lsx` (XML) com load order topológico
- [ ] `larian/deploy.ts`: Custom routing: `generated/`, `public/`, `video/` → `Data/`

#### Testes
```
1. Instalar mod BG3 com .pak → deploya no Larian Mods/ folder
2. modsettings.lsx gerado com load order correto
3. Mod com pasta generated/ → routado pra Data/
4. Mod com bin/ → routado pro game root
5. Restore → modsettings.lsx volta ao vanilla
```

---

### Fase 7: Stardew Valley Deploy (1 dia)

**Objetivo:** Stardew Valley com SMAPI.

#### Tasks
- [ ] `stardewvalley/index.ts`: `modStagingRequiresSubdir: true`
- [ ] `stardewvalley/index.ts`: `modStagingWrapSignals: ["manifest.json"]`
- [ ] `stardewvalley/index.ts`: `modFolderStripPrefixes: ["mods"]`
- [ ] `stardewvalley/index.ts`: `normalizeFolderCase: false` — preservar casing exato
- [ ] Post-deploy: `_fix_alt_textures_casing()` pra Alternative Textures

#### Testes
```
1. Mod flat na staging (manifest.json na raiz) → wrapped em ModName/
2. Mod já tem subdiretório → não é wrapped
3. Pasta "mods/Content/Foo" → prefix "mods/" stripado → "Content/Foo" deployado
4. Casing preservado: "assets/MyMod" não é alterado
5. Alternative Textures content packs funcionam
```

---

### Fase 8: Case-Insensitive Path Resolution (1 dia)

**Objetivo:** Mods Windows com paths errados funcionam no Linux.

#### Tasks
- [ ] `filemap.ts`: Implementar `_resolveSrcCase()`:
  - Dado um path relativo do mod (Windows), encontrar o arquivo real no staging (case-insensitive)
- [ ] `filemap.ts`: Implementar `_resolveDstCase()`:
  - Ao deployar, usar a canonical casing do destino (mais uppercase wins)
- [ ] `filemap.ts`: Adicionar `normalizeFolderCase` param por jogo
- [ ] Cyberpunk: `filemap_casing: "lower"` (REDengine é case-sensitive)
- [ ] Stardew Valley: `filemap_casing: "lower"` (SMAPI é case-sensitive no Linux)

#### Testes
```
1. Mod com "Data/Textures/Foo.dds" → deploya com casing correto
2. Dois mods com "Data/Textures/" vs "Data/textures/" → unificado
3. Cyberpunk: "archive/PC/mod" → normalizado pra "archive/pc/mod"
4. Stardew Valley: "assets/MyMod" preservado exatamente
5. Mod com path Windows "meshes\\actors\\foo.nif" → convertido pra forward slashes
```

---

### Fase 9: Play Pipeline Review (1 dia)

**Objetivo:** Garantir que o play pipeline funciona com todos os 34 games.

#### Tasks
- [ ] Verificar que cada game adapter tem `exeName`, `steamId`, `wineDllOverrides` corretos
- [ ] Adicionar `ensureFrameworks` como step 6 no pipeline
- [ ] Testar launch de pelo menos 1 jogo por categoria (Bethesda, BepInEx, UE5, native)

#### Testes
```
1. Skyrim LE → launch via umu-run → BepInEx carrega (se tiver)
2. Witcher 3 → launch via proton → jogo abre
3. Cyberpunk 2077 → launch via proton → CET carrega
4. Subnautica → launch via proton → BepInEx carrega
5. Valheim → launch via start_game_bepinex.sh → BepInEx carrega
6. Stardew Valley → launch via SMAPI → mods carregam
```

---

### Fase 10: Testing End-to-End (2-3 dias)

**Objetivo:** Testar o fluxo completo pra cada tipo de jogo.

#### Fluxo de Teste por Categoria

| Categoria | Jogos | Mods pra Testar |
|-----------|-------|-----------------|
| **Bethesda (Data/)** | Skyrim LE, Fallout 4 | SKSE + ENB + 2 mods .esp |
| **Bethesda (plugins.txt)** | Skyrim SE | RaceMenu + SkyUI + SMIM |
| **BepInEx** | Subnautica, Valheim | 2 BepInEx mods |
| **Cyberpunk** | Cyberpunk 2077 | CET mod + .archive mod |
| **Witcher 3** | Witcher 3 | 2 mods + Script Merger |
| **BG3** | Baldur's Gate 3 | 2 .pak mods |
| **Stardew Valley** | Stardew Valley | 2 SMAPI mods |
| **Generic** | Qualquer | Mod genérico |

#### Checklist por Jogo
```
[ ] Detecta jogo corretamente (Steam/GOG)
[ ] Cria staging dir
[ ] Extrai mod corretamente (zip/7z/rar)
[ ] FOMOD wizard aparece (se aplicável)
[ ] Framework check mostra status
[ ] Framework auto-install funciona (se aplicável)
[ ] Filemap gerado corretamente
[ ] Routing rules aplicadas corretamente
[ ] Deploy cria symlinks/hardlinks no destino certo
[ ] Plugins.txt gerado (se Bethesda)
[ ] Archive invalidation funciona (se Bethesda)
[ ] Modsettings.lsx gerado (se BG3)
[ ] Restore limpa tudo corretamente
[ ] Launch funciona via Proton
[ ] Save/load funciona
```

---

## 5. Priorização e Dependências

```
Fase 0 (LinkMode + Core) ──→ Fase 1 (Routing Rules) ──→ Fase 2 (Framework Auto-Install)
                                                                ↓
                                                          Fase 3 (Cyberpunk)
                                                          Fase 4 (Witcher 3)
                                                          Fase 5 (BepInEx deploy)
                                                          Fase 6 (BG3)
                                                          Fase 7 (Stardew)
                                                                ↓
                                                          Fase 8 (Case Resolution)
                                                                ↓
                                                          Fase 9 (Play Pipeline)
                                                                ↓
                                                          Fase 10 (E2E Testing)
```

**Ordem de implementação recomendada:**
1. **Fase 0** — Sem isso, nada funciona direito
2. **Fase 1** — Base pra todas as fases seguintes
3. **Fase 2** — Framework auto-install é o que MAIS impacta o usuário
4. **Fase 5** — BepInEx deploy pra Valheim/Subnautica (já tem routing, só falta deploy correto)
5. **Fase 3** — Cyberpunk é popular no Nexus
6. **Fase 4** — Witcher 3 popular mas precisa routing
7. **Fase 6** — BG3 é complexo mas importante
8. **Fase 7** — Stardew é niche mas tem comunidade ativa
9. **Fase 8** — Case resolution é polish
10. **Fase 9** — Play pipeline já existe, só precisa revisar
11. **Fase 10** — Testing final

---

## 6. Estimativas

| Fase | Dias | Esforço |
|------|------|---------|
| Fase 0: LinkMode + Core | 1-2 | Baixo |
| Fase 1: Custom Routing | 3-4 | Médio |
| Fase 2: Framework Auto-Install | 3-4 | Médio |
| Fase 3: Cyberpunk | 1 | Baixo |
| Fase 4: Witcher 3 | 1-2 | Médio |
| Fase 5: BepInEx deploy | 1-2 | Baixo |
| Fase 6: BG3 | 2-3 | Alto |
| Fase 7: Stardew | 1 | Baixo |
| Fase 8: Case Resolution | 1 | Médio |
| Fase 9: Play Review | 1 | Baixo |
| Fase 10: E2E Testing | 2-3 | Médio |
| **TOTAL** | **18-27 dias** | |

---

## 7. Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Thunderstore muda URLs | Alto | Versionar URLs, fallback pra releases diretas |
| Hardlink cross-device falha | Alto | Fallback automático pra symlink (já existe no Amethyst) |
| BG3 modsettings.lsx complexo | Médio | Começar com lista simples, iterar |
| SMAPI precisa de Windows installer | Médio | Extrair DLLs manualmente, ou dar instruções |
| Minecraft Fabric precisa de Java | Baixo | Detectar Java, senão dar instruções |
| Cyberpunk REDengine muda paths | Baixo | Routing rules configuráveis via storage |
| tModLoader é Steam DLC | Baixo | Detectar se já instalado, senão dar instruções |

---

## 8. Referências

- Amethyst: `/home/cas/Desktop/Amethyst-Mod-Manager-1.3.12/`
- Nosso codebase: `/home/cas/Documentos/Makai-forge/app/Catalogo/GameMod/`
- Docs existentes: `games/DIFFERENCES.md`, `games/ESTRUTURA.md`, `games/TODO.md`
- Thunderstore: `https://valheim.thunderstore.io/package/denikson/BepInExPack_Valheim/`
- SMAPI: `https://github.com/Pathoschild/SMAPI/releases`
- CET: `https://github.com/cesm2020/CET/releases`
- RED4ext: `https://github.com/wghost/RED4ext/releases`
- BG3 SE: `https://github.com/Norbyte/bg3se/releases`

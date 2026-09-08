# Diferenças por Jogo

Referência de todas as configurações únicas de cada jogo suportado.

---

## Índice

- [Bethesda — Creation Engine](#bethesda--creation-engine)
  - [Skyrim (Legendary/LE)](#skyrim-legendaryle)
  - [Skyrim Special Edition](#skyrim-special-edition)
  - [Skyrim VR](#skyrim-vr)
  - [Enderal](#enderal)
  - [Enderal SE](#enderal-se)
  - [Fallout 3](#fallout-3)
  - [Fallout New Vegas](#fallout-new-vegas)
  - [Fallout 4](#fallout-4)
  - [Fallout 4 VR](#fallout-4-vr)
  - [Oblivion](#oblivion)
  - [Morrowind](#morrowind)
  - [Starfield](#starfield)
- [Non-Bethesda](#non-bethesda)
  - [The Witcher 3](#the-witcher-3)
  - [Cyberpunk 2077](#cyberpunk-2077)
  - [Baldur's Gate 3](#baldurs-gate-3)
  - [Minecraft](#minecraft)
  - [Stardew Valley](#stardew-valley)
  - [Valheim](#valheim)
  - [RimWorld](#rimworld)
  - [Factorio](#factorio)
  - [Project Zomboid](#project-zomboid)
  - [Mount & Blade II: Bannerlord](#mount--blade-ii-bannerlord)
  - [7 Days to Die](#7-days-to-die)
  - [Subnautica](#subnautica)
  - [The Long Dark](#the-long-dark)
  - [Satisfactory](#satisfactory)
  - [Terraria](#terraria)
  - [Do Not Feed the Monkeys](#do-not-feed-the-monkeys)
  - [Kerbal Space Program](#kerbal-space-program)
  - [BattleTech](#battletech)
  - [Dragon Age: Origins](#dragon-age-origins)
  - [Dragon Age 2](#dragon-age-2)
  - [Mass Effect](#mass-effect)
  - [XCOM 2](#xcom-2)

---

## Tabela Resumo

| Jogo | Steam App ID | Deploy Dir | Script Extender | Plugins | Archive Handler |
|------|-------------|------------|-----------------|---------|-----------------|
| Skyrim LE | 72850 | Data | SKSE | .esp .esm .esl | BSA |
| Skyrim SE | 489830 | Data | SKSE64 | .esp .esm .esl | BSA |
| Skyrim VR | 611670 | Data | SKSEVR | .esp .esm .esl | BSA |
| Enderal | 933480 | Data | SKSE | .esp .esm .esl | BSA |
| Enderal SE | 976620 | Data | SKSE64 | .esp .esm .esl | BSA |
| Fallout 3 | 22300 | Data | FOSE | .esp .esm .esl | BSA |
| Fallout NV | 22380 | Data | NVSE | .esp .esm .esl | BSA |
| Fallout 4 | 377160 | Data | F4SE | .esp .esm .esl | BA2 |
| Fallout 4 VR | 611660 | Data | F4SEVR | .esp .esm .esl | BA2 |
| Oblivion | 22330 | Data | OBSE | .esp .esm | BSA |
| Morrowind | 22320 | Data Files | MWSE | .esp .esm | Nenhum |
| Starfield | 1716740 | Data | SFSE | .esp .esm .esl | BA2 |
| Witcher 3 | 292030 | mods | Nenhum | — | — |
| Cyberpunk 2077 | 1091500 | archive/pc/mod | Nenhum | — | — |
| BG3 | 1086940 | Mods | bg3se | .pak | — |
| Minecraft | — | mods | Nenhum | .jar | — |
| Stardew Valley | 413150 | Mods | SMAPI | — | — |
| Valheim | 892970 | BepInEx/plugins | BepInEx | — | — |
| RimWorld | 294100 | Mods | Nenhum | .dll | — |
| Factorio | 427520 | mods | Nenhum | .zip | — |
| Project Zomboid | 108600 | mods | Nenhum | — | — |
| Bannerlord | 261550 | Modules | Nenhum | — | — |
| 7 Days to Die | 251570 | Mods | Nenhum | — | — |
| Subnautica | 264710 | BepInEx/plugins | BepInEx | — | — |
| The Long Dark | 305620 | Mods | Nenhum | — | — |
| Satisfactory | 526870 | Mods | SML | — | — |
| Terraria | 105600 | Mods | tModLoader | — | — |
| Do Not Feed Monkeys | 658850 | — | Nenhum | — | — |
| KSP | 220200 | GameData | Nenhum | — | — |
| BattleTech | 637090 | Mods | Nenhum | — | — |
| Dragon Age: Origins | 17450 | modules | Nenhum | — | — |
| Dragon Age 2 | 1238040 | packages/core/override | Nenhum | — | — |
| Mass Effect | 1328670 | BioGame/DLC | Nenhum | — | — |
| XCOM 2 | 268500 | XComGame/Mods | Nenhum | — | — |

---

## Bethesda — Creation Engine

### Skyrim (Legendary/LE)

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 72850 |
| **Alternativos** | 72850_eng, 211940 |
| **Executável** | TESV.exe |
| **Launch preferido** | skse_loader.exe |
| **Deploy dir** | Data |
| **Nexus Domain** | skyrim |
| **Plugins** | .esp, .esm, .esl |
| **Archive Handler** | BSA |

**DLL Overrides:**
- `winmm` = native,builtin
- `version` = native,builtin
- `d3dcompiler_47` = native
- `xaudio2_0..7` = native,builtin
- `x3daudio1_0..7` = native,builtin

**Script Extender:** SKSE 1.07.03
- Loader: `skse_loader.exe`
- Download: https://skse.silverlock.org/beta/skse_1_07_03.7z

**Frameworks:** SKSE

**Ferramentas (19):** SSEEdit, FNIS, BodySlide, Outfit Studio, LOOT, Wrye Bash, Creation Kit, zEdit, CAO, Nemesis, BethINI, Pandora, DynDOLOD, TexGen, xLODGen, ESLifier, VRAMr, BENDr, ParallaxR

**Plugins vanilla:** Skyrim.esm, Update.esm, Dawnguard.esm, HearthFires.esm, Dragonborn.esm

**Comportamento único:**
- `shouldWritePluginsTxt: true`
- `shouldUseStarPrefix: true`
- `shouldIncludeVanillaPlugins: true`
- `hasLauncherSwap: true`
- Invalidation: `Skyrim - Invalidation.bsa` (0x68)
- `iniFilename: "Skyrim.ini"`

---

### Skyrim Special Edition

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 489830 |
| **Alternativos** | 489830_eng |
| **Executável** | SkyrimSE.exe |
| **Launch preferido** | skse64_loader.exe |
| **Deploy dir** | Data |
| **Nexus Domain** | skyrimspecialedition |
| **Plugins** | .esp, .esm, .esl |
| **Archive Handler** | BSA |

**DLL Overrides:** Mesmos do Skyrim LE

**Script Extender:** SKSE64 2.02.06
- Loader: `skse64_loader.exe`
- Download: https://skse.silverlock.org/beta/skse64_2_02_06.7z

**Herda de:** skyrim (deploySkyrimVariant)

**Comportamento único:**
- `skipLauncherSwap: false`
- `myGamesSubpath: "Skyrim Special Edition"`
- Save extensions: .ess, .skse

---

### Skyrim VR

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 611670 |
| **Alternativos** | 611670_eng, 611671 |
| **Executável** | SkyrimVR.exe |
| **Launch preferido** | sksevr_loader.exe |
| **Deploy dir** | Data |
| **Nexus Domain** | skyrim |

**Script Extender:** SKSEVR 2.02.06
- Loader: `sksevr_loader.exe`

**Herda de:** skyrim

**Comportamento único:**
- `myGamesSubpath: "Skyrim VR"`

---

### Enderal

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 933480 |
| **Executável** | TESV.exe |
| **Launch preferido** | skse_loader.exe |
| **Deploy dir** | Data |
| **Nexus Domain** | enderal |

**Herda de:** skyrim

**Comportamento único:**
- `skipLauncherSwap: true` ← único
- `shouldUseStarPrefix: false`
- `shouldIncludeVanillaPlugins: false`
- `myGamesSubpath: "Enderal"`
- `iniFilename: "Enderal.ini"`

---

### Enderal SE

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 976620 |
| **Executável** | SkyrimSE.exe |
| **Launch preferido** | skse64_loader.exe |
| **Deploy dir** | Data |
| **Nexus Domain** | enderal |

**Herda de:** skyrim

**Comportamento único:**
- `skipLauncherSwap: true`
- `myGamesSubpath: "Enderal Special Edition"`

---

### Fallout 3

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 22300 |
| **Executável** | Fallout3.exe |
| **Launch preferido** | fose_loader.exe |
| **Deploy dir** | Data |
| **Nexus Domain** | fallout3 |
| **Plugins** | .esp, .esm, .esl |
| **Archive Handler** | BSA |

**DLL Overrides:**
- `winmm` = native,builtin
- `version` = native,builtin
- `d3dcompiler_47` = native

**Script Extender:** FOSE 4.2.2
- Loader: `fose_loader.exe`

**Ferramentas:** FO3Edit, LOOT, Wrye Flash, GECK, zEdit

**Comportamento único:**
- `archiveListFix: "Command Extender"` (para SArchiveList >255 chars)
- `iniFilename: "FALLOUT.INI"`
- `restore: async () => {}` (vazio)

---

### Fallout New Vegas

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 22380 |
| **Alternativos** | 22380_eng, 22490 |
| **Executável** | FalloutNV.exe |
| **Launch preferido** | nvse_loader.exe |
| **Deploy dir** | Data |
| **Nexus Domain** | newvegas |

**Script Extender:** NVSE 6.2.4
- Loader: `nvse_loader.exe`

**Ferramentas:** FNVEdit, LOOT, Wrye Flash, GECK, zEdit

**Comportamento único:**
- `archiveListFix: "JIP LN NVSE"`
- `extraRoutingFiles: ["FNVpatch.exe", "nvse*.pdb"]`
- `iniFilename: "Fallout.ini"`

---

### Fallout 4

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 377160 |
| **Executável** | Fallout4.exe |
| **Launch preferido** | f4se_loader.exe |
| **Deploy dir** | Data |
| **Nexus Domain** | fallout4 |
| **Plugins** | .esp, .esm, .esl |
| **Archive Handler** | BA2 |

**DLL Overrides:**
- `winmm`, `version`, `d3dcompiler_47`, `xaudio2_0..7`, `x3daudio1_0..7`

**Script Extender:** F4SE 0.6.21
- Loader: `f4se_loader.exe`

**Ferramentas (9):** SSEEdit, LOOT, Wrye Bash, Creation Kit, zEdit, BodySlide, Outfit Studio, CAO, BethINI

**Comportamento único:**
- `modBsaExtensions: [".ba2"]` (não .bsa)
- `extraRoutingFiles: ["CustomControlMap.txt"]`
- `iniFilename: "Fallout4.ini"`

---

### Fallout 4 VR

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 611660 |
| **Alternativos** | 611660_eng, 611661 |
| **Executável** | Fallout4VR.exe |
| **Launch preferido** | f4sevr_loader.exe |

**Script Extender:** F4SEVR 0.2.0
- Loader: `f4sevr_loader.exe`

**Comportamento único:**
- `extraRoutingFiles: ["f4sevr_steam_loader.dll"]`
- `myGamesSubpath: "Fallout4 VR"`

---

### Oblivion

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 22330 |
| **Executável** | Oblivion.exe |
| **Launch preferido** | obse_loader.exe |
| **Deploy dir** | Data |
| **Nexus Domain** | oblivion |
| **Plugins** | .esp, .esm (SEM .esl) |
| **Archive Handler** | BSA |

**Script Extender:** OBSE 21.0
- Loader: `obse_loader.exe`

**Ferramentas:** TES4Edit, LOOT, Wrye Bash, TES4LodGen, Construction Set, zEdit

**Comportamento único:**
- `bsaVersion: "0x67"` (mais antigo que outros)
- `archiveListInPrefsIni: false` (diferente dos outros)
- Único sem suporte a `.esl`

---

### Morrowind

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 22320 |
| **Executável** | Morrowind.exe |
| **Launch preferido** | MGEXEgui.exe |
| **Deploy dir** | **Data Files** (não Data) |
| **Nexus Domain** | morrowind |
| **Plugins** | .esp, .esm (SEM .esl) |
| **Archive Handler** | Nenhum |

**DLL Overrides (únicos):**
- `d3d8` = native,builtin
- `dinput8` = native,builtin
- `winmm` = native,builtin
- `version` = native,builtin

**Script Extender:** MWSE 2.1
- Loader: `mwse_loader.exe`

**Ferramentas:** TES3Edit, LOOT, Wrye Mash, Construction Set, MWSE, MGE XE

**Comportamento único (MUITO diferente):**
- `shouldWritePluginsTxt: false`
- `writeMorrowindIni: true` — escreve `[Game Files]` no Morrowind.ini
- Deploy para "Data Files" (não "Data")
- Sem archive invalidation
- `hasRestore: true` (diferente dos outros Bethesda Gen 1)
- `iniFilename: "Morrowind.ini"`

---

### Starfield

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 1716740 |
| **Executável** | Starfield.exe |
| **Launch preferido** | sfse_loader.exe |
| **Deploy dir** | Data |
| **Nexus Domain** | starfield |
| **Plugins** | .esp, .esm, .esl |
| **Archive Handler** | BA2 |

**Script Extender:** SFSE 0.2.6
- Loader: `sfse_loader.exe`

**Ferramentas:** SSEEdit, LOOT, Creation Kit, zEdit, BethINI

**Comportamento único:**
- `archiveListKey: "SResourceArchiveList"` (diferente dos outros que usam `SArchiveList`)
- `iniFilename: "StarfieldCustom.ini"` (não "Starfield.ini")

---

## Non-Bethesda

### The Witcher 3

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 292030 |
| **Alternativos** | 292030_eng, 292031 |
| **Executável** | witcher3.exe |
| **Deploy dir** | mods |
| **Nexus Domain** | witcher3 |
| **Plugins** | Nenhum |
| **Engine** | REDengine 3 |

**Ferramentas:** Script Merger, Witcher 3 Mod Limit Fix

**Comportamento único:**
- Sem script extender
- Mods ficam em `mods/` (não Data)
- Sem launch.ts (deploy apenas)
- Script Merger necessário para conflitos

---

### Cyberpunk 2077

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 1091500 |
| **Executável** | Cyberpunk2077.exe |
| **Deploy dirs** | archive/pc/mod, bin/x64/plugins, r6/scripts, r6/tweaks |
| **Nexus Domain** | cyberpunk2077 |
| **Engine** | REDengine 4 |

**Frameworks:** RED4ext, Cyber Engine Tweaks

**Ferramentas:** WolvenKit, ArchiveXL, TweakXL, Codeware

**Comportamento único:**
- 4 diretórios de deploy definidos (mas deploy.ts só usa archive/pc/mod)
- Frameworks são DLLs e ASIs
- Sem launch.ts

---

### Baldur's Gate 3

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 1086940 |
| **Executável** | bg3.exe |
| **Deploy dir** | Mods |
| **Nexus Domain** | baldursgate3 |
| **Plugins** | .pak |
| **Engine** | Divinity Engine 4 |

**Frameworks:** bg3se_loader.exe

**Ferramentas:** BG3 Mod Manager

**Comportamento único:**
- Mods .pak (não .esp/.esm)
- Deploy em `Mods/`

---

### Minecraft

| Campo | Valor |
|-------|-------|
| **Steam App ID** | (nenhum) |
| **Executável** | (nenhum) |
| **Deploy dir** | mods |
| **Plugins** | .jar |
| **Engine** | Custom (Mojang) |

**Frameworks:** Fabric, Forge, NeoForge

**Comportamento único:**
- Sem integração Steam
- Sem exe detection
- `detect: () => true` (sempre detecta)
- Modloaders Java (Fabric, Forge, NeoForge)
- Sem Wine DLL overrides

---

### Stardew Valley

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 413150 |
| **Executável** | StardewValley |
| **Deploy dir** | Mods |
| **Nexus Domain** | stardewvalley |
| **Engine** | XNA/MonoGame |

**Frameworks:** SMAPI (StardewModdingAPI.exe)

**Comportamento único:**
- Mods SMAPI ficam em `Mods/`
- Sem plugins (usa Content Packs)
- Sem launch.ts

---

### Valheim

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 892970 |
| **Executável** | valheim.x86_64 |
| **Deploy dir** | BepInEx/plugins |
| **Nexus Domain** | valheim |
| **Engine** | Unity |

**Frameworks:** BepInEx

**Comportamento único:**
- Deploy dentro de `BepInEx/plugins/` (framework path)
- Sem launch.ts

---

### RimWorld

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 294100 |
| **Executável** | RimWorldLinux |
| **Deploy dir** | Mods |
| **Nexus Domain** | rimworld |
| **Plugins** | .dll |
| **Engine** | Unity |

**Comportamento único:**
- Executável Linux nativo
- Sem frameworks

---

### Factorio

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 427520 |
| **Executável** | factorio |
| **Deploy dir** | mods |
| **Plugins** | .zip |
| **Engine** | Custom (Wube) |

**Comportamento único:**
- Mods em .zip
- Sem Nexus Domain

---

### Project Zomboid

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 108600 |
| **Executável** | ProjectZomboid64 |
| **Deploy dir** | mods |
| **Nexus Domain** | projectzomboid |
| **Engine** | Custom (The Indie Stone) |

**Comportamento único:**
- 3 executáveis: ProjectZomboid64, ProjectZomboid32, .exe

---

### Mount & Blade II: Bannerlord

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 261550 |
| **Executável** | Bannerlord.exe |
| **Deploy dir** | Modules |
| **Nexus Domain** | mountandblade2bannerlord |

---

### 7 Days to Die

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 251570 |
| **Executável** | 7DaysToDie_EAC |
| **Deploy dir** | Mods |
| **Nexus Domain** | 7daystodie |

---

### Subnautica

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 264710 |
| **Executável** | Subnautica.x86_64 |
| **Deploy dir** | BepInEx/plugins |
| **Nexus Domain** | subnautica |

**Frameworks:** BepInEx

---

### The Long Dark

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 305620 |
| **Executável** | TLD.x86_64 |
| **Deploy dir** | Mods |
| **Nexus Domain** | thelongdark |

---

### Satisfactory

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 526870 |
| **Executável** | FactoryGame.exe |
| **Deploy dir** | Mods |
| **Nexus Domain** | satisfactory |

**Frameworks:** SML (SML/Bootstrap.dll)

---

### Terraria

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 105600 |
| **Executável** | Terraria |
| **Deploy dir** | Mods |
| **Nexus Domain** | (nenhum) |

**Frameworks:** tModLoader

---

### Do Not Feed the Monkeys

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 658850 |
| **Executável** | (nenhum) |
| **Deploy dir** | (nenhum) |
| **Nexus Domain** | (nenhum) |

**Comportamento único:**
- Constants quase vazias
- `detect: () => true`

---

### Kerbal Space Program

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 220200 |
| **Executável** | KSP_x64.exe |
| **Deploy dir** | GameData |
| **Nexus Domain** | kerbalspaceprogram |

---

### BattleTech

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 637090 |
| **Executável** | BattleTech.exe |
| **Deploy dir** | Mods |
| **Nexus Domain** | battletech |

---

### Dragon Age: Origins

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 17450 |
| **Alternativos** | 17450_eng, 47810 |
| **Executável** | DAOrigins.exe |
| **Deploy dir** | modules (minúsculo) |
| **Nexus Domain** | dragonage |

---

### Dragon Age 2

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 1238040 |
| **Executável** | DragonAge2.exe |
| **Deploy dir** | packages/core/override |
| **Nexus Domain** | dragonage2 |

**Comportamento único:**
- Deploy path incomum: `packages/core/override`

---

### Mass Effect

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 1328670 |
| **Executável** | MassEffectLauncher.exe |
| **Deploy dir** | BioGame/DLC |
| **Nexus Domain** | masseffect |

**Comportamento único:**
- Deploy path questionável: `BioGame/DLC` — pode estar errado para mods LE

---

### XCOM 2

| Campo | Valor |
|-------|-------|
| **Steam App ID** | 268500 |
| **Executável** | XCom2.exe |
| **Deploy dir** | XComGame/Mods |
| **Nexus Domain** | xcom2 |

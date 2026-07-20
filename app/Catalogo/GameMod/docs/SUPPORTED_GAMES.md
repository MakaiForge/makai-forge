# Jogos Suportados

> 33 jogos registrados + generico. Cada um com modulo proprio.

---

## Tabela de Referencia

| Jogo | ID | Deploy Target | Registry | DLL Overrides | Script Extender | Frameworks | Winetricks |
|------|-----|--------------|----------|---------------|-----------------|------------|------------|
| Skyrim LE | skyrim | `Data/` | Bethesda | 5 DLLs | SKSE | — | vcrun2022, dxvk |
| Skyrim SE | skyrim-se | `Data/` | Bethesda | 5 DLLs | SKSE64 | — | vcrun2022, dxvk |
| Skyrim VR | skyrim-vr | `Data/` | Bethesda | 5 DLLs | SKSE VR | — | vcrun2022, dxvk |
| Fallout 3 | fallout3 | `Data/` | Bethesda | 5 DLLs | FOSE | — | vcrun2022 |
| Fallout NV | falloutnv | `Data/` | Bethesda | 5 DLLs | NVSE | — | vcrun2022 |
| Fallout 4 | fallout4 | `Data/` | Bethesda | 5 DLLs | F4SE | — | vcrun2022, dxvk |
| Fallout 4 VR | fallout4-vr | `Data/` | Bethesda | 5 DLLs | F4SE VR | — | vcrun2022, dxvk |
| Oblivion | oblivion | `Data/` | Bethesda | 5 DLLs | OBSE | — | vcrun2022 |
| Morrowind | morrowind | `Data/` | Bethesda | 5 DLLs | MWSE | — | vcrun2022 |
| Starfield | starfield | `Data/` | Bethesda | 5 DLLs | SFSE | — | vcrun2022 |
| Enderal | enderal | `Data/` | Bethesda | 5 DLLs | OBSE | — | vcrun2022 |
| Enderal SE | enderal-s | `Data/` | Bethesda | 5 DLLs | SKSE64 | — | vcrun2022 |
| BG3 (Larian) | larian | routing | — | — | — | — | — |
| Cyberpunk 2077 | cyberpunk2077 | routing | — | 2 DLLs | — | RED4ext+CET | vcrun2022 |
| Valheim | valheim | `BepInEx/plugins` | — | — | — | BepInEx | — |
| Stardew Valley | stardewvalley | `Mods/` | — | — | — | SMAPI | — |
| Minecraft | minecraft | game root | — | — | — | — | — |
| Terraria | terraria | game root | — | — | — | — | — |
| Witcher 3 | witcher3 | game root | — | — | — | — | — |
| Mass Effect | masseffect | game root | — | — | — | — | — |
| Rimworld | rimworld | `Mods/` | — | — | — | — | — |
| Factorio | factorio | game root | — | — | — | — | — |
| Satisfactory | satisfactory | game root | — | — | — | — | — |
| Bannerlord | bannerlord | game root | — | — | — | — | — |
| XCOM 2 | xcom2 | game root | — | — | — | — | — |
| Battletech | battletech | game root | — | — | — | — | — |
| KSP | kerbalspaceprogram | game root | — | — | — | — | — |
| Project Zomboid | projectzomboid | game root | — | — | — | — | — |
| The Long Dark | thelongdark | game root | — | — | — | — | — |
| Subnautica | subnautica | game root | — | — | — | — | — |
| 7 Days to Die | 7daystodie | game root | — | — | — | — | — |
| Do Not Feed | donotfeedthemonkeys | game root | — | — | — | — | — |
| Dragon Age Origins | dragonageorigins | game root | — | — | — | — | — |
| Dragon Age 2 | dragonage2 | game root | — | — | — | — | — |

---

## Por Categoria

### Bethesda (11 jogos)
Todos compartilham: deploy `Data/`, registry Bethesda, DLL overrides (winmm, version, d3dcompiler_47, d3dx9_43, d3dx9_30), script extender, e invalidacao de archive.

### Larian (1 jogo)
BG3 usa routing customizado para mods Larian.

### Com Frameworks (3 jogos)
- **Valheim**: BepInEx (plugins em `BepInEx/plugins`)
- **Stardew Valley**: SMAPI (mods em `Mods/`)
- **Cyberpunk 2077**: RED4ext + CET

### Simples (18 jogos)
Deploy direto no game root ou `Mods/`, sem special requests.

---

##=filemapCasing

| Casing | Jogos |
|--------|-------|
| `preserve` | Skyrim variants, Fallout variants, Oblivion, Morrowind, Starfield, Enderal |
| `lower` | Cyberpunk 2077, Larian |

Todos os demais usam o default (`preserve`).

---

## defaultLinkMode

| Modo | Jogos |
|------|-------|
| `symlink` | Todos (default) |
| `hardlink` | Nenhum (opcional por jogo) |

---

## Nota

Para adicionar um novo jogo, consulte [GAME_SDK.md](./GAME_SDK.md).

export const SKYRIM_CONSTANTS = {
  steamAppId: "72850",
  altSteamAppIds: ["72850_eng", "211940"],
  exeName: "TESV.exe",
  launcherName: "SkyrimLauncher.exe",
  preferredLaunchExe: "skse_loader.exe",
  nexusDomain: "skyrim",
  lootType: "Skyrim",
  myGamesSubpath: "Skyrim",
  appDataSubpath: "Skyrim",
  appDataSubpathGog: "Skyrim GOG",
  saveExtension: [".ess"],
  iniFilename: "Skyrim.ini",
  prefsIniFilename: "SkyrimPrefs.ini",
  scriptExtenderName: "skse_loader.exe",
} as const;

export const SKYRIM_EXE_NAMES = ["TESV.exe", "Skyrim.exe", "SkyrimLauncher.exe"];

export const SKYRIM_MOD_REQUIRED_FOLDERS = new Set([
  "skse", "textures", "sound", "meshes", "mcm", "scripts",
  "interface", "lightplacer", "mapmarkers", "music", "nemesis_engine",
  "seq", "shadercache", "shaders", "grass", "video", "source",
  "calientetools", "data", "PBRNifPatcher", "PBRTextureSets",
  "distantlod", "fonts", "facegen", "menus", "lodsettings",
  "lsdata", "strings", "trees", "asi", "tools",
]);

export const SKYRIM_WINE_DLL_OVERRIDES: Record<string, string> = {
  "winmm": "native,builtin",
  "version": "native,builtin",
  "d3dcompiler_47": "native",
};

// dsound e mmdevapi: REMOVIDOS — forçar DLLs nativas do Wine para
// dsound/mmdevapi interfere com o pipeline de áudio do Proton.
// Proton gerencia dsound, mmdevapi e xaudio2 (FAudio) nativamente.
// xaudio2 NÃO deve ser sobreposto — Proton usa FAudio (reimplementação
// nativa Linux) que funciona melhor que qualquer DLL nativa do Wine.
// x3daudio mantido como native,builtin para positional audio.
for (let n = 0; n < 8; n++) {
  SKYRIM_WINE_DLL_OVERRIDES[`x3daudio1_${n}`] = "native,builtin";
}

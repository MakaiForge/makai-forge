export const SKYRIM_SE_CONSTANTS = {
  steamAppId: "489830",
  altSteamAppIds: ["489830_eng"],
  exeName: "SkyrimSE.exe",
  launcherName: "SkyrimSELauncher.exe",
  skseLoaderName: "skse64_loader.exe",
  preferredLaunchExe: "skse64_loader.exe",
  nexusDomain: "skyrimspecialedition",
  lootType: "SkyrimSE",
  myGamesSubpath: "Skyrim Special Edition",
  appDataSubpath: "Skyrim Special Edition",
  saveExtension: [".ess", ".skse"],
  iniFilename: "Skyrim.ini",
  prefsIniFilename: "SkyrimPrefs.ini",
} as const;

export const SKYRIM_SE_EXE_NAMES = ["SkyrimSE.exe", "SkyrimSELauncher.exe"];

export const SKYRIM_SE_DLL_OVERRIDES: Record<string, string> = {
  "winmm": "native,builtin",
  "version": "native,builtin",
  "d3dcompiler_47": "native",
};

// xaudio2: REMOVIDO — Proton usa FAudio (reimplementação nativa Linux)
// que funciona melhor que qualquer DLL nativa/builtin do Wine para vozes.
// x3daudio mantido como native,builtin para positional audio.
for (let n = 0; n < 8; n++) {
  SKYRIM_SE_DLL_OVERRIDES[`x3daudio1_${n}`] = "native,builtin";
}

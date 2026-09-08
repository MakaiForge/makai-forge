export const STARFIELD_CONSTANTS = {
  steamAppId: "1716740",
  altSteamAppIds: ["1716740_eng"],
  exeName: "Starfield.exe",
  launcherName: "Starfield.exe",
  preferredLaunchExe: "sfse_loader.exe",
  nexusDomain: "starfield",
  lootType: "Starfield",
  myGamesSubpath: "Starfield",
  appDataSubpath: "Starfield",
  saveExtension: [".sfs"],
} as const;

export const STARFIELD_EXE_NAMES = ["Starfield.exe"];

export const STARFIELD_DLL_OVERRIDES: Record<string, string> = {
  "winmm": "native,builtin",
  "version": "native,builtin",
  "d3dcompiler_47": "native",
};

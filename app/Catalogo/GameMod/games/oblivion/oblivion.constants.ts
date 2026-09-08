export const OBLIVION_CONSTANTS = {
  steamAppId: "22330",
  altSteamAppIds: ["22330_eng"],
  exeName: "Oblivion.exe",
  launcherName: "OblivionLauncher.exe",
  preferredLaunchExe: "obse_loader.exe",
  nexusDomain: "oblivion",
  lootType: "Oblivion",
  myGamesSubpath: "Oblivion",
  appDataSubpath: "Oblivion",
  saveExtension: [".ess"],
} as const;

export const OBLIVION_EXE_NAMES = ["Oblivion.exe", "OblivionLauncher.exe"];

export const OBLIVION_DLL_OVERRIDES: Record<string, string> = {
  "winmm": "native,builtin",
  "version": "native,builtin",
  "d3dcompiler_47": "native",
};

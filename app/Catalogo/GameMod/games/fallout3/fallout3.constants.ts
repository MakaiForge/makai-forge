export const FO3_CONSTANTS = {
  steamAppId: "22300",
  altSteamAppIds: ["22300_eng"],
  exeName: "Fallout3.exe",
  launcherName: "Fallout3Launcher.exe",
  preferredLaunchExe: "fose_loader.exe",
  nexusDomain: "fallout3",
  lootType: "Fallout3",
  myGamesSubpath: "Fallout3",
  appDataSubpath: "Fallout3",
  saveExtension: [".fos"],
} as const;

export const FO3_EXE_NAMES = ["Fallout3.exe", "Fallout3Launcher.exe"];

export const FO3_DLL_OVERRIDES: Record<string, string> = {
  "winmm": "native,builtin",
  "version": "native,builtin",
  "d3dcompiler_47": "native",
};

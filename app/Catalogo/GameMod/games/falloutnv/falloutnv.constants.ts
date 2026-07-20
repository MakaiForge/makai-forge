export const FNV_CONSTANTS = {
  steamAppId: "22380",
  altSteamAppIds: ["22380_eng", "22490"],
  exeName: "FalloutNV.exe",
  launcherName: "FalloutNVLauncher.exe",
  preferredLaunchExe: "nvse_loader.exe",
  nexusDomain: "newvegas",
  lootType: "FalloutNV",
  myGamesSubpath: "FalloutNV",
  appDataSubpath: "FalloutNV",
  saveExtension: [".fos"],
} as const;

export const FNV_EXE_NAMES = ["FalloutNV.exe", "FalloutNVLauncher.exe"];

export const FNV_DLL_OVERRIDES: Record<string, string> = {
  "winmm": "native,builtin",
  "version": "native,builtin",
  "d3dcompiler_47": "native",
};

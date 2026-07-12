export const FO4_CONSTANTS = {
  steamAppId: "377160",
  altSteamAppIds: ["377160_eng"],
  exeName: "Fallout4.exe",
  launcherName: "Fallout4Launcher.exe",
  preferredLaunchExe: "f4se_loader.exe",
  nexusDomain: "fallout4",
  lootType: "Fallout4",
  myGamesSubpath: "Fallout4",
  appDataSubpath: "Fallout4",
  saveExtension: [".f4se"],
} as const;

export const FO4_EXE_NAMES = ["Fallout4.exe", "Fallout4Launcher.exe"];

export const FO4_DLL_OVERRIDES: Record<string, string> = {
  "winmm": "native,builtin",
  "version": "native,builtin",
  "d3dcompiler_47": "native",
};

for (let n = 0; n < 8; n++) {
  FO4_DLL_OVERRIDES[`x3daudio1_${n}`] = "native,builtin";
}

export const ENDERAL_CONSTANTS = {
  steamAppId: "933480",
  altSteamAppIds: ["933480_eng"],
  exeName: "TESV.exe",
  launcherName: "Enderal Launcher.exe",
  skseLoaderName: "skse_loader.exe",
  preferredLaunchExe: "skse_loader.exe",
  nexusDomain: "enderal",
  lootType: "Enderal",
  myGamesSubpath: "Enderal",
  appDataSubpath: "enderal",
  saveExtension: [".ess"],
} as const;

export const ENDERAL_EXE_NAMES = ["Enderal Launcher.exe", "Enderal.exe", "TESV.exe"];

export const ENDERAL_DLL_OVERRIDES: Record<string, string> = {
  "winmm": "native,builtin",
  "version": "native,builtin",
  "d3dcompiler_47": "native",
};

for (let n = 0; n < 8; n++) {
  ENDERAL_DLL_OVERRIDES[`x3daudio1_${n}`] = "native,builtin";
}

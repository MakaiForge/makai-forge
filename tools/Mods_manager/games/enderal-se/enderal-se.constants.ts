export const ENDERAL_SE_CONSTANTS = {
  steamAppId: "976620",
  altSteamAppIds: ["976620_eng"],
  exeName: "SkyrimSE.exe",
  launcherName: "Enderal Launcher.exe",
  skseLoaderName: "skse64_loader.exe",
  preferredLaunchExe: "skse64_loader.exe",
  nexusDomain: "enderal",
  lootType: "EnderalSE",
  myGamesSubpath: "Enderal Special Edition",
  appDataSubpath: "Enderal Special Edition",
  saveExtension: [".ess"],
} as const;

export const ENDERAL_SE_EXE_NAMES = ["Enderal Launcher.exe", "EnderalSE.exe", "SkyrimSE.exe"];

export const ENDERAL_SE_DLL_OVERRIDES: Record<string, string> = {
  "winmm": "native,builtin",
  "version": "native,builtin",
  "d3dcompiler_47": "native",
};

for (let n = 0; n < 8; n++) {
  ENDERAL_SE_DLL_OVERRIDES[`x3daudio1_${n}`] = "native,builtin";
}

export const FO4_VR_CONSTANTS = {
  steamAppId: "611660",
  altSteamAppIds: ["611660_eng", "611661"],
  exeName: "Fallout4VR.exe",
  launcherName: "Fallout4VR.exe",
  preferredLaunchExe: "f4sevr_loader.exe",
  nexusDomain: "fallout4",
  lootType: "Fallout4VR",
  myGamesSubpath: "Fallout4 VR",
  appDataSubpath: "Fallout4 VR",
  saveExtension: [".f4se"],
} as const;

export const FO4_VR_EXE_NAMES = ["Fallout4VR.exe"];

export const FO4_VR_DLL_OVERRIDES: Record<string, string> = {
  "winmm": "native,builtin",
  "version": "native,builtin",
  "d3dcompiler_47": "native",
};

for (let n = 0; n < 8; n++) {
  FO4_VR_DLL_OVERRIDES[`x3daudio1_${n}`] = "native,builtin";
}

export const SKYRIM_VR_CONSTANTS = {
  steamAppId: "611670",
  altSteamAppIds: ["611670_eng", "611671"],
  exeName: "SkyrimVR.exe",
  launcherName: "SkyrimVR.exe",
  skseLoaderName: "sksevr_loader.exe",
  preferredLaunchExe: "sksevr_loader.exe",
  nexusDomain: "skyrim",
  lootType: "SkyrimVR",
  myGamesSubpath: "Skyrim VR",
  appDataSubpath: "Skyrim VR",
  saveExtension: [".ess", ".skse"],
  iniFilename: "Skyrim.ini",
  prefsIniFilename: "SkyrimPrefs.ini",
} as const;

export const SKYRIM_VR_EXE_NAMES = ["SkyrimVR.exe"];

export const SKYRIM_VR_DLL_OVERRIDES: Record<string, string> = {
  "winmm": "native,builtin",
  "version": "native,builtin",
  "d3dcompiler_47": "native",
};

for (let n = 0; n < 8; n++) {
  SKYRIM_VR_DLL_OVERRIDES[`x3daudio1_${n}`] = "native,builtin";
}

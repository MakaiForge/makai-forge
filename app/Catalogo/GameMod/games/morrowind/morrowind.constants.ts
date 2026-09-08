export const MORROWIND_CONSTANTS = {
  steamAppId: "22320",
  altSteamAppIds: [] as readonly string[],
  exeName: "Morrowind.exe",
  launcherName: "Morrowind Launcher.exe",
  preferredLaunchExe: "MGEXEgui.exe",
  nexusDomain: "morrowind",
  lootType: "Morrowind",
  myGamesSubpath: "Morrowind",
  appDataSubpath: "Morrowind",
  saveExtension: [".ess"],
} as const;

export const MORROWIND_EXE_NAMES = ["Morrowind.exe", "Morrowind Launcher.exe"];

export const MORROWIND_DLL_OVERRIDES: Record<string, string> = {
  "d3d8": "native,builtin",
  "dinput8": "native,builtin",
  "winmm": "native,builtin",
  "version": "native,builtin",
};

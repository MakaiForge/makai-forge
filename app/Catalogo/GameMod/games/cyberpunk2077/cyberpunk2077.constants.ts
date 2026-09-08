export const CYBERPUNK_CONSTANTS = {
  steamAppId: "1091500",
  altSteamAppIds: ["1091500_eng"],
  exeName: "Cyberpunk2077.exe",
  preferredLaunchExe: "Cyberpunk2077.exe",
  nexusDomain: "cyberpunk2077",
} as const;

export const CYBERPUNK_EXE_NAMES = ["bin/x64/Cyberpunk2077.exe", "Cyberpunk2077.exe"];

export const CYBERPUNK_DLL_OVERRIDES: Record<string, string> = {
  "winmm": "native,builtin",
  "version": "native,builtin",
};

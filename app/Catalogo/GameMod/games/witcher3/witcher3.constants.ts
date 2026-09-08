export const WITCHER3_CONSTANTS = {
  steamAppId: "292030",
  altSteamAppIds: ["292030_eng", "292031"],
  exeName: "witcher3.exe",
  preferredLaunchExe: "witcher3.exe",
  nexusDomain: "witcher3",
  deployDir: "mods",
  pluginExtensions: [] as string[],
} as const;

export const WITCHER3_EXE_NAMES = ["bin/x64/witcher3.exe", "witcher3.exe"];

export const WITCHER3_DLL_OVERRIDES: Record<string, string> = {
  "winmm": "native,builtin",
  "version": "native,builtin",
};

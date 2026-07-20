export const BG3_CONSTANTS = {
  steamAppId: "1086940",
  altSteamAppIds: ["1086940_eng"],
  exeName: "bg3.exe",
  preferredLaunchExe: "bg3.exe",
  nexusDomain: "baldursgate3",
  deployDir: "Mods",
  pluginExtensions: [".pak"],
} as const;

export const BG3_EXE_NAMES = ["bg3.exe", "bin/bg3.exe"];

export const BG3_DLL_OVERRIDES: Record<string, string> = {
  "winmm": "native,builtin",
  "version": "native,builtin",
};

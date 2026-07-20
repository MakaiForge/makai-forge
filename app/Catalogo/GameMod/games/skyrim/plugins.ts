import { collectPlugins } from "../_shared/bethesda-plugins";

export { collectPlugins };

export const PLUGIN_EXTENSIONS = [".esp", ".esm", ".esl"];

export function skyrimPluginsTxtPath(prefixPath: string, username: string): string {
  return `${prefixPath}/drive_c/users/${username}/AppData/Local/Skyrim/plugins.txt`;
}

export function shouldUseStarPrefix(): boolean {
  return true;
}

export function shouldIncludeVanillaPlugins(): boolean {
  return true;
}

export const VANILLA_PLUGINS = [
  "Skyrim.esm", "Update.esm",
  "Dawnguard.esm", "HearthFires.esm", "Dragonborn.esm",
];

export const PLUGIN_EXTENSIONS = [".esp", ".esm", ".esl"];

export const VANILLA_PLUGINS = [
  "Skyrim.esm", "Update.esm",
  "Dawnguard.esm", "HearthFires.esm", "Dragonborn.esm",
];

export function shouldUseStarPrefix(): boolean { return true; }
export function shouldIncludeVanillaPlugins(): boolean { return true; }

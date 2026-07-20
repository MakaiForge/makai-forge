import { applyWineDllOverrides, MODERN_DIRECTX_DEPS, seedBethesdaRegistryWithProton } from "../_shared/prefix";
import { SKYRIM_WINE_DLL_OVERRIDES } from "./skyrim.constants";

export function getSkyrimDllOverrides(): Record<string, string> {
  return { ...SKYRIM_WINE_DLL_OVERRIDES };
}

export function applySkyrimDllOverrides(prefixPath: string): void {
  applyWineDllOverrides(prefixPath, SKYRIM_WINE_DLL_OVERRIDES);
}

export function getSkyrimAutoInstallDeps(): string[] {
  return MODERN_DIRECTX_DEPS;
}

export function getSkyrimWinetricksComponents(): string[] {
  return ["d3dx9", "xact", "vcrun2019"];
}

/** Skyrim LE: registra caminho no registro Bethesda via proton run reg add */
export function seedSkyrimRegistry(
  prefixPath: string,
  gamePath: string,
  protonPath: string,
  steamAppId?: string,
  libraryPath?: string,
): boolean {
  return seedBethesdaRegistryWithProton(prefixPath, gamePath, protonPath, "Skyrim", steamAppId, libraryPath);
}

export function getSkyrimMyGamesSubpath(): string {
  return "Skyrim";
}

import { getSteamLaunchEnv, launchViaSteam, launchViaProton } from "../_shared/launch";
import { SKYRIM_CONSTANTS } from "./skyrim.constants";

export function getSkyrimLaunchEnv(
  gamePath: string,
  prefixPath: string,
  protonPath?: string,
): Record<string, string> {
  return getSteamLaunchEnv(
    SKYRIM_CONSTANTS.steamAppId,
    gamePath,
    prefixPath,
    protonPath,
  );
}

export function launchSkyrim(): void {
  launchViaSteam(SKYRIM_CONSTANTS.steamAppId);
}

export function launchSkyrimTool(
  exePath: string,
  protonPath: string,
  prefixPath: string,
  gamePath: string,
): void {
  const env = getSkyrimLaunchEnv(gamePath, prefixPath, protonPath);
  launchViaProton(exePath, protonPath, env);
}

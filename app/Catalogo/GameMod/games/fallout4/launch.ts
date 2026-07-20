import { getSteamLaunchEnv, launchViaSteam, launchViaProton } from "../_shared/launch";
import { FO4_CONSTANTS } from "./fallout4.constants";

export function getGameLaunchEnv(gamePath: string, prefixPath: string, protonPath?: string): Record<string, string> {
  return getSteamLaunchEnv(FO4_CONSTANTS.steamAppId, gamePath, prefixPath, protonPath);
}

export function launchGame(): void {
  launchViaSteam(FO4_CONSTANTS.steamAppId);
}

export function launchGameTool(exePath: string, protonPath: string, prefixPath: string, gamePath: string): void {
  const env = getGameLaunchEnv(gamePath, prefixPath, protonPath);
  launchViaProton(exePath, protonPath, env);
}

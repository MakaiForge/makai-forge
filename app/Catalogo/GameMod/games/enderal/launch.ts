import { getSteamLaunchEnv, launchViaSteam, launchViaProton } from "../_shared/launch";
import { ENDERAL_CONSTANTS } from "./enderal.constants";

export function getGameLaunchEnv(gamePath: string, prefixPath: string, protonPath?: string): Record<string, string> {
  return getSteamLaunchEnv(ENDERAL_CONSTANTS.steamAppId, gamePath, prefixPath, protonPath);
}

export function launchGame(): void {
  launchViaSteam(ENDERAL_CONSTANTS.steamAppId);
}

export function launchGameTool(exePath: string, protonPath: string, prefixPath: string, gamePath: string): void {
  const env = getGameLaunchEnv(gamePath, prefixPath, protonPath);
  launchViaProton(exePath, protonPath, env);
}

import { getSteamLaunchEnv, launchViaSteam, launchViaProton } from "../_shared/launch";
import { FNV_CONSTANTS } from "./falloutnv.constants";

export function getGameLaunchEnv(gamePath: string, prefixPath: string, protonPath?: string): Record<string, string> {
  return getSteamLaunchEnv(FNV_CONSTANTS.steamAppId, gamePath, prefixPath, protonPath);
}

export function launchGame(): void {
  launchViaSteam(FNV_CONSTANTS.steamAppId);
}

export function launchGameTool(exePath: string, protonPath: string, prefixPath: string, gamePath: string): void {
  const env = getGameLaunchEnv(gamePath, prefixPath, protonPath);
  launchViaProton(exePath, protonPath, env);
}

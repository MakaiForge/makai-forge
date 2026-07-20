import { getSteamLaunchEnv, launchViaSteam, launchViaProton } from "../_shared/launch";
import { MORROWIND_CONSTANTS } from "./morrowind.constants";

export function morrowindLaunchEnv(gamePath: string, prefixPath: string, protonPath?: string): Record<string, string> {
  return getSteamLaunchEnv(MORROWIND_CONSTANTS.steamAppId, gamePath, prefixPath, protonPath);
}

export function launchGame(): void {
  launchViaSteam(MORROWIND_CONSTANTS.steamAppId);
}

export function launchGameTool(exePath: string, protonPath: string, prefixPath: string, gamePath: string): void {
  const env = morrowindLaunchEnv(gamePath, prefixPath, protonPath);
  launchViaProton(exePath, protonPath, env);
}

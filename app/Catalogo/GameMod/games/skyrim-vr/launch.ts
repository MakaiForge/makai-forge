import { getSteamLaunchEnv, launchViaSteam, launchViaProton } from "../_shared/launch";
import { SKYRIM_VR_CONSTANTS } from "./skyrim-vr.constants";

export function getGameLaunchEnv(gamePath: string, prefixPath: string, protonPath?: string): Record<string, string> {
  return getSteamLaunchEnv(SKYRIM_VR_CONSTANTS.steamAppId, gamePath, prefixPath, protonPath);
}

export function launchGame(): void {
  launchViaSteam(SKYRIM_VR_CONSTANTS.steamAppId);
}

export function launchGameTool(exePath: string, protonPath: string, prefixPath: string, gamePath: string): void {
  const env = getGameLaunchEnv(gamePath, prefixPath, protonPath);
  launchViaProton(exePath, protonPath, env);
}

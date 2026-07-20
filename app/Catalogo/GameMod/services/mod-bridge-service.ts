import { MakaiRPC } from "@mods-manager/services/makai-rpc";

interface BridgeResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export async function sendCommand(cmd: string, args: Record<string, unknown> = {}): Promise<BridgeResponse> {
  try {
    const result = await MakaiRPC.call<BridgeResponse>("bridge_command", { cmd, ...args });
    return result ?? { ok: false, error: "Empty response" };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export async function listGames(): Promise<BridgeResponse> {
  return sendCommand("list_games");
}

export async function listProfiles(game: string): Promise<BridgeResponse> {
  return sendCommand("list_profiles", { game_key: game });
}

export async function deploy(
  game: string, profile: string, gamePath?: string, stagingDir?: string,
  _modlist?: Record<string, unknown>[], _protonPrefix?: string,
): Promise<BridgeResponse> {
  const args: Record<string, unknown> = { game_key: game, profile };
  if (gamePath) args.game_path = gamePath;
  if (stagingDir) args.staging_dir = stagingDir;
  return sendCommand("deploy", args);
}

export async function restore(game: string, gamePath?: string, stagingDir?: string): Promise<BridgeResponse> {
  const args: Record<string, unknown> = { game_key: game };
  if (gamePath) args.game_path = gamePath;
  if (stagingDir) args.staging_dir = stagingDir;
  return sendCommand("restore", args);
}

export async function syncSteamGames(): Promise<BridgeResponse> {
  return sendCommand("sync_steam_games");
}

interface ModCompatibleInfo {
  steamIds: Set<string>;
  names: Set<string>;
}

let cachedModInfo: ModCompatibleInfo | null = null;

export async function getModCompatibleInfo(): Promise<ModCompatibleInfo> {
  if (cachedModInfo) return cachedModInfo;
  const empty = { steamIds: new Set<string>(), names: new Set<string>() };
  try {
    const res = await listGames();
    if (res.ok && Array.isArray(res.data)) {
      const steamIds = new Set<string>();
      const names = new Set<string>();
      for (const g of res.data as any[]) {
        if (g.steam_id) steamIds.add(g.steam_id);
        if (g.name) names.add(g.name.toLowerCase());
      }
      cachedModInfo = { steamIds, names };
      return cachedModInfo;
    }
  } catch { /* bridge unavailable */ }
  return empty;
}

export function clearModCompatibleCache(): void {
  cachedModInfo = null;
}

export function shutdown(): void {
  // bridge runs inside server.py now — no-op
}

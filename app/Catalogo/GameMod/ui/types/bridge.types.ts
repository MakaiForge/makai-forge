export interface BridgeResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface DiscoveredGame {
  name: string;
  path: string;
  launcher: string;
  steam_id: string;
  game_id: string;
}

export interface BridgeGameInfo {
  name: string;
  game_id: string;
  steam_id: string;
  configured: boolean;
  game_path: string | null;
  exe_name: string;
}

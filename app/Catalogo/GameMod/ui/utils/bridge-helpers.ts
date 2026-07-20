import type { BridgeResponse, BridgeGameInfo, DiscoveredGame } from "../types/bridge.types";

export async function bridgeListGames(): Promise<BridgeResponse<BridgeGameInfo[]>> {
  try {
    const tsResult = await window.electron.modListKnownGames();
    if (tsResult.ok && Array.isArray(tsResult.data) && tsResult.data.length > 0) {
      return { ok: true, data: tsResult.data as unknown as BridgeGameInfo[] };
    }
  } catch { /* fall through */ }
  return window.electron.modBridgeListGames();
}

export async function bridgeDiscoverGames(): Promise<BridgeResponse<DiscoveredGame[]>> {
  return window.electron.modBridgeDiscoverGames();
}



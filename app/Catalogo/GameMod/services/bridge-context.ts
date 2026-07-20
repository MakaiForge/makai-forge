export interface BridgeContext {
  source: "mod-manager" | "proton-tools" | "unknown";
  gameId: string;
  prefixPath: string;
  gamePath?: string;
}

let _currentContext: BridgeContext = {
  source: "unknown",
  gameId: "",
  prefixPath: "",
};

export function setBridgeContext(ctx: Partial<BridgeContext>): BridgeContext {
  _currentContext = { ..._currentContext, ...ctx };
  return _currentContext;
}

export function getBridgeContext(): BridgeContext {
  return { ..._currentContext };
}

export function clearBridgeContext(): void {
  _currentContext = { source: "unknown", gameId: "", prefixPath: "" };
}

export function bridgeContextToPayload(): Record<string, unknown> {
  const ctx = getBridgeContext();
  const payload: Record<string, unknown> = {};
  if (ctx.source) payload.source = ctx.source;
  if (ctx.gameId) payload.game_id = ctx.gameId;
  if (ctx.prefixPath) payload.prefix_path = ctx.prefixPath;
  if (ctx.gamePath) payload.game_path = ctx.gamePath;
  return payload;
}

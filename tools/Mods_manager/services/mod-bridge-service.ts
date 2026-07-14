import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

import { app } from "electron";
import { bridgeContextToPayload } from "./bridge-context";
import { getVenvPythonPath } from "@prefix/core/venv";

const startDir = app.getAppPath();
const BRIDGE_DIR = path.join(startDir, "data", "install-api", "proton_recommended", "python", "bridge");
const VENV_PYTHON = getVenvPythonPath();
const BRIDGE_SCRIPT = path.join(BRIDGE_DIR, "bridge.py");

interface BridgeResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}

let bridgeProcess: ChildProcess | null = null;
let reqIdCounter = 0;
const pendingRequests = new Map<number, (r: BridgeResponse) => void>();
let buffer = "";

function spawnBridge(): void {
  if (bridgeProcess) return;

  if (!fs.existsSync(BRIDGE_SCRIPT)) {
    console.warn("[ModBridge] Bridge script not found at", BRIDGE_SCRIPT, "- skipping ModBridge initialization");
    return;
  }

  if (!VENV_PYTHON) {
    console.warn("[ModBridge] Venv Python não encontrado - skipping ModBridge initialization");
    return;
  }

  const pythonPath = path.join(app.getAppPath(), "data", "install-api", "proton_recommended", "python");
  console.log("[ModBridge] Spawning:", VENV_PYTHON, BRIDGE_SCRIPT);
  console.log("[ModBridge] PYTHONPATH:", pythonPath);
  console.log("[ModBridge] BRIDGE_DIR:", BRIDGE_DIR);
  console.log("[ModBridge] venv exists:", fs.existsSync(VENV_PYTHON), "script exists:", fs.existsSync(BRIDGE_SCRIPT));

  bridgeProcess = spawn(VENV_PYTHON, [BRIDGE_SCRIPT], {
    cwd: BRIDGE_DIR,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONPATH: pythonPath },
  });

  bridgeProcess.stdout!.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const resp = JSON.parse(line) as BridgeResponse & { reqId?: number };
        const reqId = resp.reqId;
        if (reqId != null && pendingRequests.has(reqId)) {
          pendingRequests.get(reqId)!(resp);
          pendingRequests.delete(reqId);
        }
      } catch {
        console.error("[ModBridge] Invalid JSON:", line);
      }
    }
  });

  bridgeProcess.stderr!.on("data", (chunk: Buffer) => {
    console.error("[ModBridge stderr]", chunk.toString());
  });

  bridgeProcess.on("exit", (code) => {
    console.log(`[ModBridge] Process exited with code ${code}`);
    bridgeProcess = null;
    for (const [, resolve] of pendingRequests) {
      resolve({ ok: false, error: "Bridge process exited" });
    }
    pendingRequests.clear();
  });

  bridgeProcess.on("error", (err) => {
    console.error("[ModBridge] Spawn error:", err.message);
    bridgeProcess = null;
    for (const [, resolve] of pendingRequests) {
      resolve({ ok: false, error: err.message });
    }
    pendingRequests.clear();
  });
}

function ensureBridge(): void {
  if (!bridgeProcess) spawnBridge();
}

export async function sendCommand(cmd: string, args: Record<string, unknown> = {}): Promise<BridgeResponse> {
  ensureBridge();
  if (!bridgeProcess || !bridgeProcess.stdin) {
    return { ok: false, error: "Bridge not available" };
  }

  const context = bridgeContextToPayload();
  const hasContext = Object.keys(context).length > 0;

  return new Promise((resolve) => {
    const reqId = ++reqIdCounter;
    const timeout = setTimeout(() => {
      pendingRequests.delete(reqId);
      resolve({ ok: false, error: `Bridge command "${cmd}" timed out after 30s` });
    }, 30_000);

    pendingRequests.set(reqId, (resp) => {
      clearTimeout(timeout);
      resolve(resp);
    });
    const payload: Record<string, unknown> = { cmd, reqId, ...args };
    if (hasContext) payload.context = context;
    const req = JSON.stringify(payload) + "\n";
    bridgeProcess!.stdin!.write(req);
  });
}

export async function listGames(): Promise<BridgeResponse> {
  return sendCommand("list_games");
}

export async function listProfiles(game: string): Promise<BridgeResponse> {
  return sendCommand("list_profiles", { game_key: game });
}

export async function deploy(game: string, profile: string, gamePath?: string, stagingDir?: string, modlist?: Record<string, unknown>[], protonPrefix?: string): Promise<BridgeResponse> {
  const args: Record<string, unknown> = { game_key: game, profile };
  if (gamePath) args.game_path = gamePath;
  if (stagingDir) args.staging_dir = stagingDir;
  if (modlist) args.modlist = modlist;
  if (protonPrefix) args.proton_prefix = protonPrefix;
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
  } catch {
    // bridge unavailable
  }
  return empty;
}

export function clearModCompatibleCache(): void {
  cachedModInfo = null;
}

export function shutdown(): void {
  if (bridgeProcess) {
    bridgeProcess.stdin?.end();
    bridgeProcess.kill();
    bridgeProcess = null;
  }
}

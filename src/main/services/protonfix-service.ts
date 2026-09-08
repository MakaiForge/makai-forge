import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { app } from "electron";
import { getProtonDataPath } from "@bootstrap/resource-manager";

const execAsync = promisify(exec);

interface ModCompatEntry {
  title: string;
  proton: string;
  score: number;
  dlls: string[];
  winetricksCommands: string[];
  minVersion: string;
  tier: string;
  scriptExtender: string;
}

function getDb(): any {
  try {
    const Database = require("better-sqlite3");
    const dbPath = getProtonDataPath();
    const db = new Database(dbPath, { readonly: true });
    db.pragma("journal_mode = WAL");
    return db;
  } catch {
    return null;
  }
}

let compatCache: { games: Record<string, ModCompatEntry>; nameToId: Map<string, string> } | null = null;

function loadCompat(): { games: Record<string, ModCompatEntry>; nameToId: Map<string, string> } {
  if (compatCache) return compatCache;

  const games: Record<string, ModCompatEntry> = {};
  const nameToId = new Map<string, string>();

  // Try SQLite first
  const db = getDb();
  if (db) {
    try {
      const rows = db.prepare("SELECT * FROM mod_compat").all();
      for (const row of rows) {
        const entry: ModCompatEntry = {
          title: row.title || "",
          proton: row.proton || "",
          score: row.score || 0,
          dlls: row.dlls ? JSON.parse(row.dlls) : [],
          winetricksCommands: row.winetricks ? JSON.parse(row.winetricks) : [],
          minVersion: row.min_version || "",
          tier: row.tier || "",
          scriptExtender: row.script_extender || "",
        };
        games[row.app_id] = entry;
        if (entry.title) {
          nameToId.set(entry.title.toLowerCase(), row.app_id);
        }
      }
      compatCache = { games, nameToId };
      return compatCache;
    } catch {
      // Fallback to JSON
    }
  }

  // Fallback to JSON
  const fs = require("node:fs");
  const jsonPath = path.join(
    app.getAppPath(), "tools", "plaina_proton", "api proton", "mod_compat.json"
  );
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const rawGames: Record<string, any> = raw.games || {};

  for (const [appId, entry] of Object.entries(rawGames)) {
    const e = entry as any;
    games[appId] = {
      title: e.title || "",
      proton: e.proton || "",
      score: e.score || 0,
      dlls: e.dlls || [],
      winetricksCommands: e.winetricksCommands || [],
      minVersion: e.minVersion || "",
      tier: e.tier || "",
      scriptExtender: e.scriptExtender || "",
    };
    if (e.title) {
      nameToId.set(e.title.toLowerCase(), appId);
      const short = e.title.replace(/^(The Elder Scrolls|Fallout|The)\s+/i, "").toLowerCase();
      nameToId.set(short, appId);
    }
  }

  compatCache = { games, nameToId };
  return compatCache;
}

export class ProtonfixService {

  static async preparePrefix(gameName: string): Promise<{ success: boolean; log: string[] }> {
    const log: string[] = [];
    log.push(`Preparing prefix for ${gameName}...`);

    const { nameToId, games } = loadCompat();
    const appId = nameToId.get(gameName.toLowerCase());

    if (!appId || !games[appId]) {
      log.push(`No Protonfix data for ${gameName}`);
      return { success: false, log };
    }

    const tricks = games[appId].winetricksCommands || [];
    if (tricks.length === 0) {
      log.push(`No winetricks commands needed for ${gameName}`);
      return { success: true, log };
    }

    try {
      await execAsync("which protontricks", { timeout: 5000 });
    } catch {
      log.push("protontricks not found — install with: sudo apt install protontricks");
      return { success: false, log };
    }

    log.push(`Applying tricks for app ${appId}: ${tricks.join(", ")}`);

    for (const trick of tricks) {
      try {
        const cmd = `protontricks "${appId}" ${trick}`;
        log.push(`Running: ${cmd}`);
        const { stdout, stderr } = await execAsync(cmd, { timeout: 120000 });
        if (stdout.trim()) log.push(`  stdout: ${stdout.trim().slice(0, 200)}`);
        if (stderr.trim()) log.push(`  stderr: ${stderr.trim().slice(0, 200)}`);
        log.push(`  ✓ ${trick} applied`);
      } catch (err) {
        log.push(`  ✗ ${trick} failed: ${String(err).slice(0, 200)}`);
      }
    }

    log.push("Prefix preparation complete");
    return { success: true, log };
  }

  static getGameAppId(gameName: string): string | null {
    const { nameToId } = loadCompat();
    return nameToId.get(gameName.toLowerCase()) || null;
  }

  static getGameCompatInfo(gameName: string): ModCompatEntry | null {
    const { nameToId, games } = loadCompat();
    const appId = nameToId.get(gameName.toLowerCase());
    if (!appId) return null;
    return games[appId] || null;
  }
}

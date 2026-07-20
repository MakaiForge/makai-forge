import { registerEvent } from "@main/events/register-event";
import Database from "better-sqlite3";
import path from "node:path";
import { app } from "electron";

interface ProtonDbData {
  gameId: string;
  steamAppId: string;
  totalReports: number;
  versions: Array<{
    version: string;
    total: number;
    positive: number;
    negative: number;
    positiveRatio: number;
  }>;
  recommended: string[];
}

function getDbPath(): string {
  const dataDir = app.isPackaged
    ? path.join(process.resourcesPath, "data")
    : path.join(app.getAppPath(), "data");

  return path.join(
    dataDir,
    "install-api",
    "proton_recommended",
    "proton_db",
    "proton_recommended.db"
  );
}

let _db: Database.Database | null = null;

function getDb(): Database.Database | null {
  if (_db) return _db;
  const dbPath = getDbPath();
  try {
    _db = new Database(dbPath, { readonly: true });
    _db.pragma("journal_mode = WAL");
    return _db;
  } catch {
    return null;
  }
}

const GAME_ID_MAP: Record<string, string> = {
  "skyrim vanilla": "skyrim",
  "skyrim special edition": "skyrim_se",
  "skyrim se": "skyrim_se",
  "skyrim vr": "skyrim_vr",
  "fallout 3": "fallout3",
  "fallout new vegas": "falloutnv",
  "fallout 4": "fallout4",
  "fallout 4 vr": "fallout4_vr",
  "the elder scrolls iv: oblivion": "oblivion",
  "the elder scrolls iii: morrowind": "morrowind",
  "the witcher 3": "witcher3",
  "cyberpunk 2077": "cyberpunk2077",
  "baldur's gate 3": "larian",
  "stardew valley": "stardewvalley",
  "7 days to die": "7daystodie",
  "the long dark": "thelongdark",
  "do not feed the monkeys": "donotfeedthemonkeys",
  "kerbal space program": "kerbalspaceprogram",
  "dragon age: origins": "dragonageorigins",
  "dragon age ii": "dragonage2",
  "mass effect": "masseffect",
  "mass effect legendary": "masseffect",
  "xcom 2": "xcom2",
};

function normalizeGameId(raw: string): string {
  const key = raw.toLowerCase().trim();
  return GAME_ID_MAP[key] || key;
}

const getProtonDbData = async (
  _event: Electron.IpcMainInvokeEvent,
  gameId: string
): Promise<ProtonDbData | null> => {
  try {
    const db = getDb();
    if (!db) return null;

    const normalizedId = normalizeGameId(gameId);

    const row = db
      .prepare(
        "SELECT game_id, steam_app_id, total_reports, recommended, versions FROM game_recommendations WHERE game_id = ?"
      )
      .get(normalizedId) as
      | {
          game_id: string;
          steam_app_id: string;
          total_reports: number;
          recommended: string;
          versions: string;
        }
      | undefined;

    if (!row) return null;

    return {
      gameId: row.game_id,
      steamAppId: row.steam_app_id,
      totalReports: row.total_reports,
      recommended: JSON.parse(row.recommended),
      versions: JSON.parse(row.versions),
    };
  } catch {
    return null;
  }
};

registerEvent("getProtonDbData", getProtonDbData);

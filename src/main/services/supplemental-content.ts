import path from "node:path";
import { app } from "electron";
import { normalizeDownloadUri } from "./torrent-trackers";

const Database = require("better-sqlite3") as typeof import("better-sqlite3");

let db: any = null;
let stmt: any = null;

function getDbPath(): string {
  return path.join(app.getAppPath(), "app", "_data", "supplemental.db");
}

function ensureDb(): void {
  if (db) return;
  const dbPath = getDbPath();
  db = new Database(dbPath, { readonly: true });
  stmt = db.prepare("SELECT downloadSources, downloads FROM games WHERE id = ?");
}

export function getSupplementalMapSize(): number {
  ensureDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM games").get();
  return row?.count ?? 0;
}

export function getSupplementalData(
  shop: string,
  objectId: string
): { downloadSources: string[]; downloads: any[] } | null {
  ensureDb();

  const key = `${shop}:${objectId}`;
  const row = stmt.get(key);
  if (!row) return null;

  let downloadSources: string[];
  let downloads: any[];

  try {
    downloadSources = JSON.parse(row.downloadSources);
    downloads = JSON.parse(row.downloads);
  } catch {
    return null;
  }

  // Sanitiza URIs (remove \r\n e decodifica entidades HTML — &amp; -> &)
  downloads = (downloads || []).map((d: any) => ({
    ...d,
    uris: Array.isArray(d?.uris)
      ? d.uris
          .filter((u: any) => u?.trim())
          .map((u: any) => normalizeDownloadUri(u))
      : d?.uris,
  }));

  if (!downloadSources?.length && !downloads?.length) return null;

  return { downloadSources: downloadSources ?? [], downloads: downloads ?? [] };
}

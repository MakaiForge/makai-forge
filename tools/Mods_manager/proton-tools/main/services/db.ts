import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import type { ProtonRelease } from "./types";
import { logger } from "@main/services/logger";

function getDbPath(): string {
  const candidates = [
    path.join(app.getAppPath(), "resources", "fork_catalog.db"),
    path.join(app.getAppPath(), "resources", "database", "fork_catalog.db"),
    path.join(app.getPath("userData"), "resources", "database", "fork_catalog.db"),
  ];
  if (app.isPackaged) {
    candidates.unshift(path.join(process.resourcesPath, "fork_catalog.db"));
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return "";
}

export function getReleasesByForkId(forkId: string): ProtonRelease[] {
  const dbPath = getDbPath();
  if (!dbPath) {
    logger.warn(`[fork_catalog] DB não encontrado`);
    return [];
  }

  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });

    const rows = db
      .prepare(
        `SELECT id, tag, published_at, release_url
         FROM releases
         WHERE fork_id = ?
         ORDER BY published_at DESC`
      )
      .all(forkId) as { id: number; tag: string; published_at: string; release_url: string }[];

    if (rows.length === 0) {
      db.close();
      return [];
    }

    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(",");

    const assetRows = db
      .prepare(
        `SELECT release_id, name, download_url
         FROM assets
         WHERE release_id IN (${placeholders})
         ORDER BY id ASC`
      )
      .all(...ids) as { release_id: number; name: string; download_url: string }[];

    db.close();

    const assetsByRelease: Record<number, { name: string; browser_download_url: string }[]> = {};
    for (const a of assetRows) {
      if (!assetsByRelease[a.release_id]) assetsByRelease[a.release_id] = [];
      assetsByRelease[a.release_id].push({
        name: a.name,
        browser_download_url: a.download_url,
      });
    }

    return rows.map((r) => ({
      tag_name: r.tag,
      assets: assetsByRelease[r.id] || [],
      html_url: r.release_url || "",
      published_at: r.published_at || "",
    }));
  } catch (err) {
    logger.error(`[fork_catalog] Erro ao consultar releases para "${forkId}":`, err);
    return [];
  }
}

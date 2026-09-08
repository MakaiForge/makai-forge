import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import type { ProtonRelease } from "./types";
import { logger } from "@main/services/logger";

function getDbPath(): string {
  const candidates = [
    path.join(app.getAppPath(), "app", "_data", "fork_catalog.db"),
    path.join(app.getPath("userData"), "resources", "database", "fork_catalog.db"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return "";
}

export interface ForkCatalogEntry {
  id: string
  name: string
  category: string
  ranking: string
  tierScore: number
  versionCount: number
  versions: string[]
  description: string
  source: string
  features: string[]
}

/**
 * Lê o catálogo completo de forks/versões direto do fork_catalog.db
 * (mesma forma que o RPC list_available_forks, sem depender do server Python).
 */
export function getForkCatalogFromDb(): ForkCatalogEntry[] {
  const dbPath = getDbPath();
  if (!dbPath) {
    logger.warn(`[fork_catalog] DB não encontrado`);
    return [];
  }

  let db: any = null;
  try {
    const Database = require("better-sqlite3");
    db = new Database(dbPath, { readonly: true });

    const forks = db
      .prepare(
        `SELECT id, name, category, description, repo_url, features FROM forks`
      )
      .all() as {
      id: string
      name: string | null
      category: string | null
      description: string | null
      repo_url: string | null
      features: string | null
    }[];

    const releases = db
      .prepare(`SELECT fork_id, tag FROM releases ORDER BY id ASC`)
      .all() as { fork_id: string; tag: string }[];

    const versionsByFork: Record<string, string[]> = {};
    for (const r of releases) {
      if (!versionsByFork[r.fork_id]) versionsByFork[r.fork_id] = [];
      versionsByFork[r.fork_id].push(r.tag);
    }

    const maxV = Math.max(1, ...Object.values(versionsByFork).map((v) => v.length));

    return forks
      .map((f) => {
        const versions = versionsByFork[f.id] || [];
        const vcount = versions.length;
        const tierScore = vcount > 0 ? Math.round((30 + (vcount / maxV) * 70) * 10) / 10 : 30;
        const ranking =
          tierScore >= 80 ? "gold" : tierScore >= 50 ? "silver" : tierScore >= 20 ? "bronze" : "experimental";

        let features: string[] = [];
        if (f.features) {
          try {
            const parsed = JSON.parse(f.features);
            if (Array.isArray(parsed)) features = parsed.map(String);
          } catch {
            features = [];
          }
        }

        return {
          id: String(f.id),
          name: f.name || String(f.id),
          category: f.category || "Proton",
          ranking,
          tierScore,
          versionCount: vcount,
          versions: vcount > 0 ? versions : ["latest"],
          description: f.description || "",
          source: f.repo_url || "",
          features: features.slice(0, 8),
        };
      })
      .sort((a, b) => b.tierScore - a.tierScore || a.name.localeCompare(b.name));
  } catch (err) {
    logger.error(`[fork_catalog] Erro ao ler catálogo:`, err);
    return [];
  } finally {
    try { db?.close(); } catch {}
  }
}

export function getReleasesByForkId(forkId: string): ProtonRelease[] {
  const dbPath = getDbPath();
  if (!dbPath) {
    logger.warn(`[fork_catalog] DB não encontrado`);
    return [];
  }

  let db: any = null;
  try {
    const Database = require("better-sqlite3");
    db = new Database(dbPath, { readonly: true });

    const rows = db
      .prepare(
        `SELECT id, tag, published_at, release_url
         FROM releases
         WHERE fork_id = ?
         ORDER BY published_at DESC`
      )
      .all(forkId) as { id: number; tag: string; published_at: string; release_url: string }[];

    if (rows.length === 0) {
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
    }));    } catch (err) {
    logger.error(`[fork_catalog] Erro ao consultar releases para "${forkId}":`, err);
    return [];
  } finally {
    try { db?.close(); } catch {}
  }
}

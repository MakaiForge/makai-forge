import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { logger } from "./logger";
import { normalizeDownloadUri } from "./torrent-trackers";

let cachedCatalogDbPath: string | null = null;

function getCatalogDbPath(): string {
  if (cachedCatalogDbPath) return cachedCatalogDbPath;

  const userDataPath = path.join(
    app.getPath("userData"),
    "resources",
    "database",
    "catalogo.db"
  );
  const appDataPath = path.join(app.getAppPath(), "app", "_data", "catalogo.db");

  const candidates = [userDataPath, appDataPath].filter((p) => fs.existsSync(p));
  if (candidates.length <= 1) {
    cachedCatalogDbPath = candidates[0] || appDataPath;
    return cachedCatalogDbPath;
  }

  // Prefer the copy with the most games: the app-shipped full catalog
  // must win over stale/truncated userData copies left by the bootstrap.
  let best = candidates[0];
  let bestCount = -1;
  for (const dbPath of candidates) {
    try {
      const stdout = execFileSync(
        "/usr/bin/sqlite3",
        ["-json", dbPath, "SELECT COUNT(*) as count FROM games;"],
        { timeout: 15000, encoding: "utf8" }
      );
      const count = JSON.parse(stdout)?.[0]?.count ?? 0;
      if (count > bestCount) {
        bestCount = count;
        best = dbPath;
      }
    } catch {
      // unreadable/invalid db — skip
    }
  }

  cachedCatalogDbPath = best;
  return best;
}

function sqliteQuery(sql: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const dbPath = getCatalogDbPath();
    execFile(
      "/usr/bin/sqlite3",
      ["-json", dbPath, sql],
      { timeout: 10000 },
      (err, stdout) => {
        if (err) return reject(err);
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve([]);
        }
      }
    );
  });
}

function escapeSql(s: string): string {
  return s.replace(/'/g, "''");
}

function enrichGame(g: any) {
  if (!g) return null;
  const parse = (v: any) => {
    try {
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  };
  return {
    id: g.objectId,
    objectId: g.objectId,
    title: g.title,
    shop: g.shop || "steam",
    genres: parse(g.genres) || [],
    releaseYear: g.release_year || g.releaseYear || null,
    libraryImageUrl: g.library_image_url || g.libraryImageUrl || null,
    shortDescription: g.short_description || g.shortDescription || null,
    developers: g.developer ? [g.developer] : parse(g.developers) || [],
    publishers: g.publisher ? [g.publisher] : parse(g.publishers) || [],
    headerImageUrl: g.header_image_url || g.headerImageUrl || null,
    screenshots: parse(g.screenshots) || [],
    movies: parse(g.movies) || [],
    pcRequirements: (() => {
      const parsed = parse(g.pcRequirements);
      if (parsed && (parsed.minimum || parsed.recommended)) return parsed;
      // Requisitos ficam nas colunas minimum/recommended do catalogo.db
      // (~174k jogos) — o JSON pcRequirements só cobre alguns jogos.
      const min = g.minimum || "";
      const rec = g.recommended || "";
      if (min || rec) return { minimum: min, recommended: rec };
      return parsed || undefined;
    })(),
    protonAlternatives: parse(g.protonAlternatives) || [],
    downloads: (parse(g.downloads) || []).map((d: any) => ({
      ...d,
      uris: Array.isArray(d?.uris)
        ? d.uris
            .filter((u: any) => u?.trim())
            .map((u: any) => normalizeDownloadUri(u))
        : d?.uris,
    })),
    downloadSources: parse(g.downloadSources) || [],
    libraryHeroImageUrl: g.libraryHeroImageUrl || null,
    iconUrl: g.iconUrl || null,
    release_date: parse(g.release_date) || null,
    estimated_owners: g.estimated_owners || 0,
    metacriticScore: g.metacritic_score || null,
    steam_appid: g.steam_appid || null,
  };
}

export async function localSearchGames(
  filters: Record<string, any>,
  take = 20,
  skip = 0
): Promise<{ edges: any[]; count: number }> {
  const title = (filters.title || "").trim().toLowerCase();
  const genres = filters.genre || filters.genres || [];
  const developers = filters.developers || [];
  const publishers = filters.publishers || [];
  const showAdult = filters.showAdult;

  try {
    const conditions: string[] = [];

    if (title) {
      const terms = title
        .split(/\s+/)
        .filter(Boolean)
        .map((t: string) => `"${escapeSql(t)}"*`)
        .join(" ");
      try {
        const extraConditions: string[] = [];
        if (genres.length > 0) {
          extraConditions.push(
            `(${genres
              .map((g: string) => `g.genres LIKE '%${escapeSql(g)}%'`)
              .join(" OR ")})`
          );
        }
        if (developers.length > 0) {
          extraConditions.push(
            `(${developers
              .map((d: string) => `g.developer LIKE '%${escapeSql(d)}%'`)
              .join(" OR ")})`
          );
        }
        if (publishers.length > 0) {
          extraConditions.push(
            `(${publishers
              .map((p: string) => `g.publisher LIKE '%${escapeSql(p)}%'`)
              .join(" OR ")})`
          );
        }
        const filterSql =
          extraConditions.length > 0
            ? ` AND ${extraConditions.join(" AND ")}`
            : "";
        // JOIN com o FTS preserva o rank — mesma lógica do catálogo antigo
        const joinSql = `FROM games g INNER JOIN games_fts fts ON g.rowid = fts.rowid WHERE games_fts MATCH '${terms}'${filterSql}`;
        const countResult = await sqliteQuery(
          `SELECT COUNT(*) as count ${joinSql}`
        );
        const count = countResult?.[0]?.count || 0;
        if (count > 0) {
          const games = await sqliteQuery(
            `SELECT g.* ${joinSql} ORDER BY g.estimated_owners DESC, rank LIMIT ${take} OFFSET ${skip}`
          );
          return {
            edges: games.map(enrichGame).filter(Boolean),
            count,
          };
        }
        // no FTS matches — fallback to LIKE for this title
        conditions.push(`LOWER(title) LIKE '%${escapeSql(title)}%'`);
      } catch {
        // FTS not available, fallback to LIKE
        conditions.push(`LOWER(title) LIKE '%${escapeSql(title)}%'`);
      }
    }

    if (genres.length > 0) {
      const genreConditions = genres.map(
        (g: string) => `genres LIKE '%${escapeSql(g)}%'`
      );
      conditions.push(`(${genreConditions.join(" OR ")})`);
    }

    if (developers.length > 0) {
      const devConditions = developers.map(
        (d: string) => `developer LIKE '%${escapeSql(d)}%'`
      );
      conditions.push(`(${devConditions.join(" OR ")})`);
    }

    if (publishers.length > 0) {
      const pubConditions = publishers.map(
        (p: string) => `publisher LIKE '%${escapeSql(p)}%'`
      );
      conditions.push(`(${pubConditions.join(" OR ")})`);
    }

    // NOTE: the full catalog (catalogo.db) has no is_adult column, so the
    // explicit-content filter is a no-op here.
    void showAdult;

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await sqliteQuery(
      `SELECT COUNT(*) as count FROM games ${whereClause}`
    );
    const count = countResult?.[0]?.count || 0;

    const games = await sqliteQuery(
      `SELECT * FROM games ${whereClause} ORDER BY estimated_owners DESC LIMIT ${take} OFFSET ${skip}`
    );

    return {
      edges: games.map(enrichGame).filter(Boolean),
      count,
    };
  } catch (err: any) {
    logger.error(`[LocalCatalog] Search error: ${err.message}`);
    return { edges: [], count: 0 };
  }
}

export async function localSearchSuggestions(
  title: string
): Promise<Array<{ objectId: string; title: string; shop: string }>> {
  if (!title || !title.trim()) return [];

  try {
    const query = title.trim().toLowerCase();
    const terms = query
      .split(/\s+/)
      .filter(Boolean)
      .map((t: string) => `"${escapeSql(t)}"*`)
      .join(" ");

    try {
      const joinSql = `FROM games g INNER JOIN games_fts fts ON g.rowid = fts.rowid WHERE games_fts MATCH '${terms}'`;
      const games = await sqliteQuery(
        `SELECT g.objectId, g.title, g.shop ${joinSql} ORDER BY g.estimated_owners DESC, rank LIMIT 8`
      );
      if (games.length > 0) {
        return games.map((g: any) => ({
          objectId: g.objectId,
          title: g.title,
          shop: g.shop || "steam",
        }));
      }
    } catch {
      // FTS not available
    }

    const games = await sqliteQuery(
      `SELECT objectId, title, shop FROM games WHERE LOWER(title) LIKE '%${escapeSql(query)}%' ORDER BY estimated_owners DESC LIMIT 8`
    );
    return games.map((g: any) => ({
      objectId: g.objectId,
      title: g.title,
      shop: g.shop || "steam",
    }));
  } catch {
    return [];
  }
}

export async function localGetGame(
  objectId: string
): Promise<any | null> {
  try {
    const rows = await sqliteQuery(
      `SELECT * FROM games WHERE objectId = '${escapeSql(objectId)}' LIMIT 1`
    );
    if (rows.length === 0) return null;
    return enrichGame(rows[0]);
  } catch {
    return null;
  }
}

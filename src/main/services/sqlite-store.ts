import path from "node:path";
import { app } from "electron";

const Database = require("better-sqlite3") as typeof import("better-sqlite3");

interface Column {
  name: string;
  type: string;
  primaryKey?: boolean;
  notNull?: boolean;
  default?: string;
}

const TABLES: Record<string, { columns: Column[] }> = {
  settings: {
    columns: [
      { name: "id", type: "TEXT", primaryKey: true },
      { name: "data", type: "TEXT", notNull: true },
    ],
  },
  games: {
    columns: [
      { name: "id", type: "TEXT", primaryKey: true },
      { name: "data", type: "TEXT", notNull: true },
    ],
  },
  downloads: {
    columns: [
      { name: "id", type: "TEXT", primaryKey: true },
      { name: "data", type: "TEXT", notNull: true },
    ],
  },
  shop_assets: {
    columns: [
      { name: "id", type: "TEXT", primaryKey: true },
      { name: "data", type: "TEXT", notNull: true },
    ],
  },
  shop_cache: {
    columns: [
      { name: "id", type: "TEXT", primaryKey: true },
      { name: "data", type: "TEXT", notNull: true },
    ],
  },
  stats_cache: {
    columns: [
      { name: "id", type: "TEXT", primaryKey: true },
      { name: "data", type: "TEXT", notNull: true },
    ],
  },
  download_sources: {
    columns: [
      { name: "id", type: "TEXT", primaryKey: true },
      { name: "data", type: "TEXT", notNull: true },
    ],
  },
  themes: {
    columns: [
      { name: "id", type: "TEXT", primaryKey: true },
      { name: "data", type: "TEXT", notNull: true },
    ],
  },
  local_notifications: {
    columns: [
      { name: "id", type: "TEXT", primaryKey: true },
      { name: "data", type: "TEXT", notNull: true },
    ],
  },
};

function getDbPath(): string {
  return path.join(app.getPath("userData"), "stores.db");
}

let globalDb: any = null;

let migrated = false;

function getDb(): any {
  if (globalDb) return globalDb;
  const dbPath = getDbPath();
  globalDb = new Database(dbPath);
  globalDb.pragma("journal_mode = WAL");
  initTables(globalDb);
  if (!migrated) {
    migrated = true;
    migrateJsonToSqlite();
  }
  return globalDb;
}

function initTables(db: any): void {
  for (const [tableName, { columns }] of Object.entries(TABLES)) {
    const colDefs = columns
      .map((col) => {
        const parts = [col.name, col.type];
        if (col.primaryKey) parts.push("PRIMARY KEY");
        if (col.notNull) parts.push("NOT NULL");
        if (col.default) parts.push(`DEFAULT ${col.default}`);
        return parts.join(" ");
      })
      .join(", ");
    db.exec(`CREATE TABLE IF NOT EXISTS ${tableName} (${colDefs})`);

    // Fix tables that were created with wrong schema (key/value instead of id/data, etc.)
    const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
    const expectedCols = columns.map((c) => c.name);
    const actualCols = tableInfo.map((c: any) => c.name);
    if (!expectedCols.every((c) => actualCols.includes(c))) {
      db.exec(`DROP TABLE IF EXISTS ${tableName}`);
      db.exec(`CREATE TABLE ${tableName} (${colDefs})`);
    }
  }
}

export class SqliteStore {
  private table: string;

  constructor(tableName: string) {
    if (!TABLES[tableName]) {
      throw new Error(`Unknown table: ${tableName}`);
    }
    this.table = tableName;
  }

  async get<KK extends string = string, VV = any>(key: KK, _options?: unknown): Promise<VV> {
    const db = getDb();
    const row = db.prepare(`SELECT data FROM ${this.table} WHERE id = ?`).get(key);
    if (!row) {
      const err = new Error("Key not found in database") as Error & { code: string; status: number; name: string };
      err.name = "NotFoundError";
      err.code = "NOT_FOUND";
      err.status = 404;
      throw err;
    }
    return JSON.parse(row.data) as VV;
  }

  async getMany<VV = any>(keys: string[], _options?: unknown): Promise<VV[]> {
    const db = getDb();
    const placeholders = keys.map(() => "?").join(",");
    const rows = db.prepare(`SELECT data FROM ${this.table} WHERE id IN (${placeholders})`).all(...keys);
    return rows.map((r: any) => JSON.parse(r.data) as VV);
  }

  async put<VV = any>(key: string, value: VV, _options?: unknown): Promise<void> {
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO ${this.table} (id, data) VALUES (?, ?)`
    ).run(key, JSON.stringify(value));
  }

  async del(key: string): Promise<void> {
    const db = getDb();
    db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(key);
  }

  async clear(): Promise<void> {
    const db = getDb();
    db.prepare(`DELETE FROM ${this.table}`).run();
  }

  values<VV = any>(): { all(): Promise<VV[]> } & AsyncIterable<VV> {
    const db = getDb();
    const rows = db.prepare(`SELECT data FROM ${this.table}`).all();
    const items = rows.map((r: any) => JSON.parse(r.data)) as VV[];
    return {
      all: async () => items,
      [Symbol.asyncIterator](): AsyncIterator<VV> {
        let i = 0;
        return {
          next(): Promise<IteratorResult<VV>> {
            if (i < items.length) {
              return Promise.resolve({ value: items[i++], done: false });
            }
            return Promise.resolve({ value: undefined, done: true });
          },
        };
      },
    };
  }

  iterator(): { all(): Promise<[string, any][]> } & AsyncIterable<[string, any]> {
    const db = getDb();
    const rows = db.prepare(`SELECT id, data FROM ${this.table}`).all();
    const entries = rows.map((r: any) => [r.id, JSON.parse(r.data)] as [string, unknown]);
    return {
      all: async () => entries,
      [Symbol.asyncIterator](): AsyncIterator<[string, unknown]> {
        let i = 0;
        return {
          next(): Promise<IteratorResult<[string, unknown]>> {
            if (i < entries.length) {
              return Promise.resolve({ value: entries[i++], done: false });
            }
            return Promise.resolve({ value: undefined, done: true });
          },
        };
      },
    };
  }

  keys(): { all(): Promise<string[]> } & AsyncIterable<string> {
    const db = getDb();
    const rows = db.prepare(`SELECT id FROM ${this.table}`).all();
    const items = rows.map((r: any) => r.id);
    return {
      all: async () => items,
      [Symbol.asyncIterator](): AsyncIterator<string> {
        let i = 0;
        return {
          next(): Promise<IteratorResult<string>> {
            if (i < items.length) {
              return Promise.resolve({ value: items[i++], done: false });
            }
            return Promise.resolve({ value: undefined, done: true });
          },
        };
      },
    };
  }

  batch(operations: Array<{ type: "put" | "del"; key: string; value?: unknown }>): Promise<void>;
  batch(): { put(key: string, value: unknown): void; del(key: string): void; write(): Promise<void> };
  batch(
    operations?: Array<{ type: "put" | "del"; key: string; value?: unknown }>
  ): Promise<void> | { put(key: string, value: unknown): void; del(key: string): void; write(): Promise<void> } {
    if (operations) {
      const db = getDb();
      const putStmt = db.prepare(
        `INSERT OR REPLACE INTO ${this.table} (id, data) VALUES (?, ?)`
      );
      const delStmt = db.prepare(`DELETE FROM ${this.table} WHERE id = ?`);
      const transaction = db.transaction(() => {
        for (const op of operations) {
          if (op.type === "put") {
            putStmt.run(op.key, JSON.stringify(op.value));
          } else if (op.type === "del") {
            delStmt.run(op.key);
          }
        }
      });
      transaction();
      return Promise.resolve();
    }

    const ops: Array<{ type: "put" | "del"; key: string; value?: unknown }> = [];
    const self = this;
    return {
      put(key: string, value: unknown): void {
        ops.push({ type: "put", key, value });
      },
      del(key: string): void {
        ops.push({ type: "del", key });
      },
      write(): Promise<void> {
        if (ops.length === 0) return Promise.resolve();
        return self.batch(ops);
      },
    };
  }

  sublevel(_name: string): SqliteStore {
    return this;
  }

  async close(): Promise<void> {
    // no-op — global db stays open
  }
}

export function migrateJsonToSqlite(): void {
  const fs = require("node:fs");
  const storesDir = path.join(app.getPath("userData"), "stores");

  if (!fs.existsSync(storesDir)) return;

  const FILE_TABLE_MAP: Record<string, string | ((data: Record<string, unknown>) => void)> = {
    "app.json": "settings",
    "games.json": "games",
    "downloads.json": "downloads",
    "sources.json": "download_sources",
    "stats.json": "stats_cache",
    "ui.json": (data) => {
      const themeStore = new SqliteStore("themes");
      const notifStore = new SqliteStore("local_notifications");
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith("notification:")) {
          notifStore.put(key, value);
        } else {
          themeStore.put(key, value);
        }
      }
    },
    "shop.json": (data) => {
      const assetsStore = new SqliteStore("shop_assets");
      const cacheStore = new SqliteStore("shop_cache");
      for (const [key, value] of Object.entries(data)) {
        const parts = key.split(":");
        if (parts.length >= 3) {
          cacheStore.put(key, value);
        } else {
          assetsStore.put(key, value);
        }
      }
    },
  };

  for (const [filename, target] of Object.entries(FILE_TABLE_MAP)) {
    const filePath = path.join(storesDir, filename);
    if (!fs.existsSync(filePath)) continue;

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw);

      if (typeof target === "function") {
        target(data);
      } else {
        const store = new SqliteStore(target);
        for (const [key, value] of Object.entries(data)) {
          const entry = value as Record<string, unknown>;
          if (entry.isDeleted === true) continue;
          store.put(key, value);
        }
      }
    } catch (err) {
      console.error(`[migrate] Failed to migrate ${filename}:`, err);
    }
  }

  // Remove migrated JSON files so stale entries don't re-import on next startup
  for (const filename of Object.keys(FILE_TABLE_MAP)) {
    const filePath = path.join(storesDir, filename);
    try { fs.rmSync(filePath); } catch {}
  }
}

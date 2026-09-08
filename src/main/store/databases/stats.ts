import { SqliteStore } from "@main/services/sqlite-store";

export const statsDb = new SqliteStore("stats_cache");

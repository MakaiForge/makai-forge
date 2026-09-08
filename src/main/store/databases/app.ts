import { SqliteStore } from "@main/services/sqlite-store";

export const appDb = new SqliteStore("settings");

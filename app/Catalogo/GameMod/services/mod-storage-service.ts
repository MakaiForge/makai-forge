import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const STORE_PATH = path.join(app.getPath("userData"), "mods-store.json");

let cache: Record<string, unknown> | null = null;

function load(): Record<string, unknown> {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    cache = JSON.parse(raw);
  } catch {
    cache = {};
  }
  return cache!;
}

function save(): void {
  if (!cache) return;
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

export class ModStorageService {
  static get<T>(key: string): T | undefined {
    return load()[key] as T | undefined;
  }

  static put(key: string, value: unknown): void {
    load()[key] = value;
    save();
  }

  static delete(key: string): void {
    if (Object.hasOwn(load(), key)) {
      delete load()[key];
      save();
    }
  }

  static entries<T>(prefix?: string): { key: string; value: T }[] {
    const data = load();
    const result: { key: string; value: T }[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (!prefix || key.startsWith(prefix)) {
        result.push({ key, value: value as T });
      }
    }
    return result;
  }

  static getAll<T>(prefix?: string): T[] {
    return this.entries<T>(prefix).map((e) => e.value);
  }

  static keys(prefix?: string): string[] {
    const data = load();
    return Object.keys(data).filter((k) => !prefix || k.startsWith(prefix));
  }

  static clear(): void {
    cache = {};
    save();
  }
}

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const storeDir = path.join(app.getPath("userData"), "stores");

function filePath(name: string): string {
  return path.join(storeDir, `${name}.json`);
}

function load<T>(name: string): Record<string, T> {
  try {
    const raw = fs.readFileSync(filePath(name), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function save<T>(name: string, data: Record<string, T>): void {
  fs.mkdirSync(storeDir, { recursive: true });
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf-8");
}

export class FileStore {
  static get<T>(store: string, key: string): T | undefined {
    return load<T>(store)[key];
  }

  static put<T>(store: string, key: string, value: T): void {
    const data = load<T>(store);
    data[key] = value;
    save(store, data);
  }

  static delete(store: string, key: string): void {
    const data = load(store);
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      delete data[key];
      save(store, data);
    }
  }

  static entries<T>(store: string, prefix?: string): { key: string; value: T }[] {
    const data = load<T>(store);
    return Object.entries(data)
      .filter(([k]) => !prefix || k.startsWith(prefix))
      .map(([key, value]) => ({ key, value: value as T }));
  }

  static getAll<T>(store: string, prefix?: string): T[] {
    return this.entries<T>(store, prefix).map((e) => e.value);
  }

  static has(store: string, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(load(store), key);
  }
}

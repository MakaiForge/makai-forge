import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ModStorageService } from "./mod-storage-service";

const BACKUPS_DIR = path.join(
  process.env.HOME || os.homedir(),
  ".local",
  "share",
  "protonforge",
  "backups"
);

const MAX_BACKUPS = 20;

const BACKUP_KEYS = [
  "modlist",
  "plugins",
  "profile_state",
] as const;

type BackupKey = (typeof BACKUP_KEYS)[number];

export interface BackupMeta {
  timestamp: string;
  label: string;
  kept: boolean;
  dir: string;
}

export class ModBackupService {

  static backupDir(gameId: string, profile: string): string {
    return path.join(BACKUPS_DIR, gameId, profile);
  }

  static timestampDir(base: string): { dir: string; ts: string } {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dir = path.join(base, ts);
    return { dir, ts };
  }

  static createBackup(gameId: string, profile: string): BackupMeta {
    const base = this.backupDir(gameId, profile);
    fs.mkdirSync(base, { recursive: true });

    const { dir, ts } = this.timestampDir(base);
    fs.mkdirSync(dir, { recursive: true });

    for (const key of BACKUP_KEYS) {
      const storeKey = `game:${gameId}:profile:${profile}:${key}`;
      const data = ModStorageService.get(storeKey);
      if (data !== null && data !== undefined) {
        fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(data, null, 2), "utf-8");
      }
    }

    this.pruneOld(base);

    return { timestamp: ts, label: ts, kept: false, dir };
  }

  static listBackups(gameId: string, profile: string): BackupMeta[] {
    const base = this.backupDir(gameId, profile);
    if (!fs.existsSync(base)) return [];

    const result: BackupMeta[] = [];
    for (const entry of fs.readdirSync(base)) {
      const full = path.join(base, entry);
      if (!fs.statSync(full).isDirectory()) continue;
      const kept = fs.existsSync(path.join(full, ".keep"));
      result.push({ timestamp: entry, label: entry, kept, dir: full });
    }
    result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return result;
  }

  static restoreBackup(gameId: string, profile: string, backupDir: string): boolean {
    const base = this.backupDir(gameId, profile);
    const src = path.isAbsolute(backupDir) ? backupDir : path.join(base, backupDir);
    if (!fs.existsSync(src)) return false;

    for (const key of BACKUP_KEYS) {
      const filePath = path.join(src, `${key}.json`);
      if (!fs.existsSync(filePath)) continue;
      try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        const storeKey = `game:${gameId}:profile:${profile}:${key}`;
        ModStorageService.put(storeKey, data);
      } catch { /* skip corrupt files */ }
    }
    return true;
  }

  static setKept(backupDir: string, kept: boolean): void {
    const marker = path.join(backupDir, ".keep");
    if (kept) {
      fs.writeFileSync(marker, "");
    } else {
      try { fs.unlinkSync(marker); } catch { /* ignore */ }
    }
  }

  private static pruneOld(base: string): void {
    if (!fs.existsSync(base)) return;
    const dirs = fs.readdirSync(base)
      .map(d => path.join(base, d))
      .filter(d => fs.statSync(d).isDirectory() && !fs.existsSync(path.join(d, ".keep")));
    dirs.sort();
    while (dirs.length > MAX_BACKUPS) {
      const oldest = dirs.shift();
      if (oldest) fs.rmSync(oldest, { recursive: true, force: true });
    }
  }
}

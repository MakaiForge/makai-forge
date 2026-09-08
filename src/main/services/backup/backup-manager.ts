import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { CloudProvider, RemoteFile } from "./cloud-provider";
import { collectGameJsons } from "./local-backup";

export interface BackupProgress {
  percent: number;
  status: string;
}

export interface BackupResult {
  totalSizeBytes: number;
  gameCount: number;
  steamCount: number;
  customCount: number;
  timestamp: string;
}

export interface BackupVersion {
  timestamp: string;
  date: string;
  files: RemoteFile[];
  totalSizeBytes: number;
}

export type ProgressCallback = (progress: BackupProgress) => void;

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function formatDate(ts: string): string {
  const m = ts.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (!m) return ts;
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}`;
}

function getTimestampFromPath(destPath: string): string | null {
  const m = destPath.match(/-(\d{8}-\d{6})\.tar$/);
  return m ? m[1] : null;
}

export { formatTimestamp, formatDate, getTimestampFromPath };

export class BackupManager {
  private backupsPath: string;

  constructor() {
    const userData = app.getPath("userData");
    this.backupsPath = path.join(userData, "BackupsTemp");
  }

  async runBackup(
    provider: CloudProvider,
    onProgress?: ProgressCallback
  ): Promise<BackupResult> {
    fs.mkdirSync(this.backupsPath, { recursive: true });
    const startedAt = Date.now();
    const ts = formatTimestamp();

    const emit = (percent: number, status: string) => {
      onProgress?.({ percent, status });
    };

    emit(25, "Compactando JSONs dos jogos...");
    console.log("[Backup] Iniciando collectGameJsons...");
    const result = await collectGameJsons(
      this.backupsPath
    );

    if (!result) {
      console.log("[Backup] Nenhum jogo encontrado para backup");
      emit(100, "Nenhum jogo encontrado para backup");
      return {
        totalSizeBytes: 0,
        gameCount: 0,
        steamCount: 0,
        customCount: 0,
        timestamp: ts,
      };
    }

    console.log(`[Backup] collectGameJsons retornou: ${result.tarPath}`);

    emit(50, `Enviando 1 arquivo para ${provider.name}...`);

    const destPath = `ProtonForgeBackups/games-backup.tar`;
    console.log(`[Backup] Enviando: ${result.tarPath} -> ${destPath}`);
    emit(60, `Enviando games-backup.tar...`);
    await provider.upload(result.tarPath, destPath);
    console.log(`[Backup] Upload concluído`);

    const tarSize = fs.statSync(result.tarPath).size;

    try {
      await fs.promises.rm(result.tarPath);
    } catch { }

    try {
      await fs.promises.rm(this.backupsPath, { recursive: true });
    } catch { }

    emit(100, `Backup concluído em ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

    return {
      totalSizeBytes: tarSize,
      gameCount: result.totalCount,
      steamCount: result.steamCount,
      customCount: result.customCount,
      timestamp: ts,
    };
  }

  getBackupsPath(): string {
    return this.backupsPath;
  }
}

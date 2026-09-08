import path from "node:path";
import fs from "node:fs";
import * as tar from "tar";
import { scanSteamLibrary } from "../steam-scanner";

export interface SteamBackupResult {
  appId: string;
  name: string;
  tarPath: string;
  sizeBytes: number;
}

export async function collectSteamPrefixes(
  backupsPath: string
): Promise<SteamBackupResult[]> {
  const games = await scanSteamLibrary();
  const results: SteamBackupResult[] = [];

  for (const game of games) {
    const compatDataPath = game.compatDataPath;
    if (!compatDataPath) continue;

    const pfxPath = path.join(compatDataPath, "pfx");
    if (!fs.existsSync(pfxPath)) continue;

    const tarName = `steam-${game.appId}.tar`;
    const tarPath = path.join(backupsPath, tarName);

    if (fs.existsSync(tarPath)) {
      try {
        await fs.promises.rm(tarPath);
      } catch { }
    }

    await tar.create(
      {
        gzip: false,
        file: tarPath,
        cwd: compatDataPath,
      },
      ["pfx"]
    );

    const stat = fs.statSync(tarPath);
    results.push({
      appId: game.appId,
      name: game.name,
      tarPath,
      sizeBytes: stat.size,
    });
  }

  return results;
}

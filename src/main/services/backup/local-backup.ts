import path from "node:path";
import fs from "node:fs";
import * as tar from "tar";
import { gamesStore } from "@main/store";

const GAMES_JSON_FILENAME = "games-backup.json";
const GAMES_TAR_FILENAME = "games-backup.tar";

export interface GameJsonsResult {
  tarPath: string;
  steamCount: number;
  customCount: number;
  totalCount: number;
}

export async function collectGameJsons(
  backupsPath: string
): Promise<GameJsonsResult | null> {
  console.log("[Backup] Lendo jogos do store (gamesStore)...");

  const entries = await gamesStore.iterator().all();
  console.log(`[Backup] Total de entries no store: ${entries.length}`);

  if (entries.length > 0) {
    console.log(`[Backup] Primeira entry:`, JSON.stringify(entries[0], null, 2).slice(0, 500));
  }

  const games = entries
    .map(([, value]) => value as any)
    .filter((g: any) => !g.isDeleted);

  const steamCount = games.filter((g: any) => g.shop === "steam").length;
  const customCount = games.filter((g: any) => g.shop === "custom").length;

  console.log(`[Backup] Jogos após filtrar isDeleted: ${games.length}`);
  console.log(`[Backup] Steam: ${steamCount}, Custom: ${customCount}, Outros: ${games.length - steamCount - customCount}`);

  if (games.length === 0) {
    console.log("[Backup] Nenhum jogo encontrado - retornando null");
    return null;
  }

  console.log(`[Backup] Primeiro jogo: ${games[0].title} (shop: ${games[0].shop}, objectId: ${games[0].objectId})`);

  const jsonPath = path.join(backupsPath, GAMES_JSON_FILENAME);
  const tarPath = path.join(backupsPath, GAMES_TAR_FILENAME);

  fs.writeFileSync(jsonPath, JSON.stringify(games, null, 2));

  const jsonSize = fs.statSync(jsonPath).size;
  console.log(`[Backup] JSON escrito: ${jsonPath} (${jsonSize} bytes)`);

  await tar.create(
    {
      gzip: false,
      file: tarPath,
      cwd: backupsPath,
    },
    [GAMES_JSON_FILENAME]
  );

  const tarSize = fs.statSync(tarPath).size;
  console.log(`[Backup] TAR criado: ${tarPath} (${tarSize} bytes)`);

  try { fs.rmSync(jsonPath); } catch {}

  return { tarPath, steamCount, customCount, totalCount: games.length };
}

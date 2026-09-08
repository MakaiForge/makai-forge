import fs from "node:fs";
import path from "node:path";
import { logger } from "@main/services";
import { gamesStore, storeKeys } from "@main/store";
import type { GameShop } from "@types";

export function clearCompatData(compatDir: string): boolean {
  if (!fs.existsSync(compatDir)) return true;
  try {
    const entries = fs.readdirSync(compatDir);
    for (const entry of entries) {
      const fullPath = path.join(compatDir, entry);
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
    logger.info(`Cleared compatdata contents: ${compatDir}`);
    return true;
  } catch (err) {
    logger.error(`Failed to clear compatdata: ${compatDir}`, err);
    return false;
  }
}

export function ensureCompatData(compatDir: string): void {
  fs.mkdirSync(compatDir, { recursive: true });
}

export async function deleteGamePrefix(
  shop: GameShop,
  objectId: string,
): Promise<void> {
  const gameKey = storeKeys.game(shop, objectId);
  let game: any = null;
  try { game = await gamesStore.get(gameKey); } catch {}

  if (!game) {
    logger.warn(`deleteGamePrefix: game not found for key=${gameKey}`);
    return;
  }

  if (!game.winePrefixPath) {
    logger.warn(`deleteGamePrefix: winePrefixPath is null/empty for ${game.title} (key=${gameKey})`);
    return;
  }

  const prefixPath = game.winePrefixPath;
  logger.info(`deleteGamePrefix: deleting prefix at "${prefixPath}" for ${game.title}`);

  if (fs.existsSync(prefixPath)) {
    try {
      await fs.promises.rm(prefixPath, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
      logger.info(`Deleted Wine prefix: ${prefixPath}`);
    } catch (error) {
      logger.error(`Failed to delete Wine prefix: ${prefixPath}`, error);
    }
  } else {
    logger.warn(`deleteGamePrefix: prefix path does not exist on disk: ${prefixPath}`);
  }

  await gamesStore.put(gameKey, { ...game, winePrefixPath: null });
}

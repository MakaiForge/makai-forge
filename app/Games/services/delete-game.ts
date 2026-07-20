import { gamesStore, gamesShopAssetsStore, storeKeys } from "@main/store";
import type { GameShop } from "@types";
import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { logger } from "@main/services";

export { deleteGamePrefix } from "@prefix/core/clear";

export async function deleteGameFromDatabase(
  shop: GameShop,
  objectId: string
): Promise<void> {
  const gameKey = storeKeys.game(shop, objectId);
  let game: any = null;
  try { game = await gamesStore.get(gameKey); } catch {}

  if (game) {
    const assetUrls =
      game.shop !== "steam"
        ? [game.iconUrl, game.logoImageUrl, game.libraryHeroImageUrl]
        : [game.customIconUrl, game.customLogoImageUrl, game.customHeroImageUrl];

    for (const url of assetUrls) {
      if (url?.startsWith("local:")) {
        try {
          const p = url.replace("local:", "");
          if (fs.existsSync(p)) {
            await fs.promises.unlink(p);
            logger.info(`Deleted asset: ${p}`);
          }
        } catch (error) {
          logger.warn(`Failed to delete asset:`, error);
        }
      }
    }
  }

  await gamesStore.del(gameKey);
  await gamesShopAssetsStore.del(gameKey).catch(() => {});

  const storesDir = path.join(app.getPath("userData"), "stores");
  const gamesJsonPath = path.join(storesDir, "games.json");
  if (fs.existsSync(gamesJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(gamesJsonPath, "utf-8"));
      delete data[gameKey];
      fs.writeFileSync(gamesJsonPath, JSON.stringify(data, null, 2), "utf-8");
    } catch {}
  }

  const gamesJsonDir = path.join(app.getPath("userData"), "games");
  const gameJsonPath = path.join(gamesJsonDir, `${objectId}.json`);
  try { if (fs.existsSync(gameJsonPath)) fs.rmSync(gameJsonPath); } catch {}

  logger.info(`Game deleted from database: ${gameKey}`);
}

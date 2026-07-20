import path from "node:path";
import fs from "node:fs";

import type { LibraryGame, GameShop } from "@types";
import { registerEvent } from "@main/events/register-event";
import {
  downloadsStore,
  gamesShopAssetsStore,
  gamesStore,
} from "@main/store";
import { MakaiApi } from "@main/services/makai-api";

const getLibrary = async (): Promise<LibraryGame[]> => {
  return gamesStore
    .iterator()
    .all()
    .then((results) => {
      return Promise.all(
        results.map(async ([key, game]) => {
          const download = await downloadsStore.get(key).catch(() => null);
          const [shopStr, objectId] = key.split(":");
          const shop = shopStr as GameShop;

          let gameAssets = shop !== "steam"
            ? await gamesShopAssetsStore.get(key).catch(() => null)
            : null;

          if (!gameAssets && shop !== "steam") {
            const apiGame = await MakaiApi.getGame(objectId);
            if (apiGame) {
              gameAssets = {
                iconUrl: apiGame.libraryImageUrl || null,
                libraryImageUrl: apiGame.libraryImageUrl || null,
                libraryHeroImageUrl: apiGame.libraryHeroImageUrl || null,
                logoImageUrl: apiGame.libraryImageUrl || null,
                coverImageUrl: null,
              };
            }
          }

          // Verify installer still exists, clear if deleted externally
          let installerSizeInBytes = game.installerSizeInBytes;
          if (installerSizeInBytes && download?.folderName) {
            const installerPath = path.join(
              download.downloadPath,
              download.folderName
            );

            if (!fs.existsSync(installerPath)) {
              installerSizeInBytes = null;
              gamesStore.put(key, { ...game, installerSizeInBytes: null });
            }
          }

          // Verify installed folder still exists, clear if deleted externally
          let installedSizeInBytes = game.installedSizeInBytes;
          if (installedSizeInBytes && game.executablePath) {
            const executableDir = path.dirname(game.executablePath);

            if (!fs.existsSync(executableDir)) {
              installedSizeInBytes = null;
              gamesStore.put(key, {
                ...game,
                installerSizeInBytes,
                installedSizeInBytes: null,
              });
            }
          }

          return {
            ...game,
            id: key,
            objectId,
            shop,
            installerSizeInBytes,
            installedSizeInBytes,
            download: download ?? null,
            // Spread gameAssets last to ensure all image URLs are properly set
            ...gameAssets,
            // Preserve custom image URLs from game if they exist
            customIconUrl: game.customIconUrl,
            customLogoImageUrl: game.customLogoImageUrl,
            customHeroImageUrl: game.customHeroImageUrl,
          };
        })
      );
    });
};

registerEvent("getLibrary", getLibrary);

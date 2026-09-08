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
import { localGetGame } from "@main/services/local-catalog";
import { resolveGameImages } from "@main/services/image-cache";

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

          // Lê o store de assets para TODAS as lojas (a versão antiga lia sem
          // restrição — o guard `shop !== "steam"` era a regressão que deixava
          // jogos Steam sem imagem na aba Downloads).
          let gameAssets = await gamesShopAssetsStore
            .get(key)
            .catch(() => null);

          if (!gameAssets) {
            const apiGame = await MakaiApi.getGame(objectId).catch(() => null);
            if (apiGame) {
              gameAssets = {
                iconUrl: apiGame.libraryImageUrl || null,
                libraryImageUrl: apiGame.libraryImageUrl || null,
                libraryHeroImageUrl: apiGame.libraryHeroImageUrl || null,
                logoImageUrl: apiGame.libraryImageUrl || null,
                coverImageUrl: null,
              };
            } else {
              // Fallback: catálogo local (mesma fonte da versão antiga)
              const localGame = await localGetGame(objectId).catch(() => null);
              if (localGame) {
                gameAssets = {
                  iconUrl: localGame.iconUrl || null,
                  libraryImageUrl: localGame.libraryImageUrl || null,
                  libraryHeroImageUrl: localGame.libraryHeroImageUrl || null,
                  logoImageUrl: localGame.libraryImageUrl || null,
                  coverImageUrl: null,
                };
              }
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

          return resolveGameImages({
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
          });
        })
      );
    });
};

registerEvent("getLibrary", getLibrary);

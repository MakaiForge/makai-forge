import { registerEvent } from "@main/events/register-event";
import { gamesStore, gamesShopAssetsStore, storeKeys } from "@main/store";
import { randomUUID } from "node:crypto";
import type { GameShop } from "@types";
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import { formatGameDirName } from "@main/helpers/format-game-dir-name";

const extractSteamAppId = (url?: string): string | null => {
  if (!url) return null;
  const match = url.match(/steam\/apps\/(\d+)/);
  return match ? match[1] : null;
};

const getGamesFolder = () => {
  const userDataPath = app.getPath("userData");
  return path.join(userDataPath, "games");
};

const saveGameJson = (objectId: string, gameData: Record<string, unknown>) => {
  const folder = getGamesFolder();
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  const filePath = path.join(folder, `${objectId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(gameData, null, 2), "utf-8");
};

export const addCustomGameToLibrary = async (
  _event: Electron.IpcMainInvokeEvent,
  title: string,
  executablePath: string,
  iconUrl?: string,
  logoImageUrl?: string,
  libraryHeroImageUrl?: string,
  runner?: string,
  protonVersion?: string,
  protonPath?: string,
  prefix?: string
) => {
  const objectId = randomUUID();
  const shop: GameShop = "custom";
  const gameKey = storeKeys.game(shop, objectId);

  const existingGames = await gamesStore.iterator().all();
  let finalTitle = title;
  let counter = 1;

  while (existingGames.some(([_, game]) => game.title === finalTitle)) {
    counter++;
    finalTitle = `${title} (Copy ${counter - 1})`;
  }

  const steamAppId =
    extractSteamAppId(iconUrl) || extractSteamAppId(libraryHeroImageUrl);

  let localHeaderPath = "";
  let localProfilePath = "";

  if (steamAppId) {
    try {
      const baseDir = path.join(app.getPath("userData"), "game-covers");
      const gameDir = path.join(baseDir, objectId);

      if (!fs.existsSync(gameDir)) {
        fs.mkdirSync(gameDir, { recursive: true });
      }

      const headerUrl = `https://steamcdn-a.akamaihd.net/steam/apps/${steamAppId}/header.jpg`;
      const profileUrl = `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_600x900_2x.jpg`;

      const headerPath = path.join(gameDir, `${steamAppId}_header.jpg`);
      const profilePath = path.join(gameDir, `${steamAppId}_profile.jpg`);

      const downloadImage = async (
        url: string,
        destPath: string
      ): Promise<boolean> => {
        try {
          const response = await fetch(url);
          if (!response.ok) return false;

          const fileStream = fs.createWriteStream(destPath);
          const { pipeline } = await import("node:stream/promises");
          await pipeline(response.body as any, fileStream);
          return true;
        } catch {
          return false;
        }
      };

      if (!fs.existsSync(headerPath)) {
        await downloadImage(headerUrl, headerPath);
      }
      if (!fs.existsSync(profilePath)) {
        await downloadImage(profileUrl, profilePath);
      }

      if (fs.existsSync(headerPath)) {
        localHeaderPath = headerPath;
      }
      if (fs.existsSync(profilePath)) {
        localProfilePath = profilePath;
      }
    } catch (error) {
      console.error("Failed to download covers:", error);
    }
  }

  const assets = {
    updatedAt: Date.now(),
    objectId,
    shop,
    title: finalTitle,
    iconUrl: localHeaderPath || iconUrl || null,
    libraryHeroImageUrl: libraryHeroImageUrl || "",
    libraryImageUrl: localHeaderPath || iconUrl || "",
    logoImageUrl: logoImageUrl || "",
    logoPosition: null,
    coverImageUrl: localProfilePath || "",
    downloadSources: [],
    steamAppId: steamAppId || null,
  };
  await gamesShopAssetsStore.put(gameKey, assets);

  const homePath = process.env.HOME || app.getPath("home");
  const winePrefixPath = prefix
    ? prefix
    : path.join(homePath, "Games", "MakaiForger", formatGameDirName(finalTitle));

  if (winePrefixPath && !fs.existsSync(winePrefixPath)) {
    fs.mkdirSync(winePrefixPath, { recursive: true });
  }

  const game = {
    title: finalTitle,
    iconUrl: localHeaderPath || iconUrl || null,
    logoImageUrl: logoImageUrl || null,
    libraryHeroImageUrl: libraryHeroImageUrl || null,
    objectId,
    shop,
    remoteId: steamAppId || null,
    isDeleted: false,
    playTimeInMilliseconds: 0,
    lastTimePlayed: null,
    executablePath,
    launchOptions: null,
    favorite: false,
    automaticCloudSync: false,
    hasManuallyUpdatedPlaytime: false,
    winePrefixPath: winePrefixPath || null,
    runner: runner || "proton",
    protonVersion: protonVersion || null,
    protonPath: protonPath || null,
    downloadSource: "local",
  };

  await gamesStore.put(gameKey, game);

  saveGameJson(objectId, game);

  return game;
};

registerEvent("addCustomGameToLibrary", addCustomGameToLibrary);

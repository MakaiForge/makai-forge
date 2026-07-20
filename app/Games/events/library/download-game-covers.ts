import { registerEvent } from "@main/events/register-event";
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";

interface DownloadGameCoversResult {
  success: boolean;
  headerPath?: string;
  profilePath?: string;
  error?: string;
}

const downloadGameCovers = async (
  _event: Electron.IpcMainInvokeEvent,
  steamAppId: string,
  objectId: string,
  _gameTitle: string
): Promise<DownloadGameCoversResult> => {
  try {
    const baseDir = path.join(app.getPath("userData"), "game-covers");

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

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
        await pipeline(response.body as any, fileStream);
        return true;
      } catch {
        return false;
      }
    };

    let headerDownloaded = false;
    let profileDownloaded = false;

    if (!fs.existsSync(headerPath)) {
      headerDownloaded = await downloadImage(headerUrl, headerPath);
    } else {
      headerDownloaded = true;
    }

    if (!fs.existsSync(profilePath)) {
      profileDownloaded = await downloadImage(profileUrl, profilePath);
    } else {
      profileDownloaded = true;
    }

    if (!headerDownloaded && !profileDownloaded) {
      return { success: false, error: "Failed to download covers" };
    }

    return {
      success: true,
      headerPath: headerDownloaded ? headerPath : undefined,
      profilePath: profileDownloaded ? profilePath : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

registerEvent("downloadGameCovers", downloadGameCovers);

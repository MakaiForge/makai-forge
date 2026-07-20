import { registerEvent } from "@main/events/register-event";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ASSETS_PATH } from "@main/constants";
import sharp from "sharp";

const ASSET_SIZES = {
  icon: { width: 400, height: 533 },
  logo: { width: 200, height: 100 },
  hero: { width: 1920, height: 1080 },
};

const copyCustomGameAsset = async (
  _event: Electron.IpcMainInvokeEvent,
  sourcePath: string,
  assetType: "icon" | "logo" | "hero"
): Promise<string> => {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error("Source file does not exist");
  }

  if (!fs.existsSync(ASSETS_PATH)) {
    fs.mkdirSync(ASSETS_PATH, { recursive: true });
  }

  const customGamesAssetsPath = path.join(ASSETS_PATH, "custom-games");
  if (!fs.existsSync(customGamesAssetsPath)) {
    fs.mkdirSync(customGamesAssetsPath, { recursive: true });
  }

  const uniqueId = randomUUID();
  const fileName = `${assetType}-${uniqueId}.webp`;
  const destinationPath = path.join(customGamesAssetsPath, fileName);

  const { width, height } = ASSET_SIZES[assetType];

  await sharp(sourcePath)
    .resize(width, height, {
      fit: "cover",
      position: "center",
    })
    .webp({ quality: 85 })
    .toFile(destinationPath);

  return `local:${destinationPath}`;
};

registerEvent("copyCustomGameAsset", copyCustomGameAsset);

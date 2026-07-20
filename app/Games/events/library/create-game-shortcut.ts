import { registerEvent } from "@main/events/register-event";
import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { removeSymbolsFromName } from "@shared";
import { GameShop, ShortcutLocation } from "@types";
import { gamesStore, storeKeys } from "@main/store";
import { SystemPath } from "@main/services/system-path";
import { ASSETS_PATH } from "@main/constants";
import { getGameAssets } from "@main/events/catalogue/get-game-assets";
import { logger } from "@main/services";

const isValidUrl = (url: string | null | undefined): url is string => {
  return (
    !!url &&
    (url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("local:"))
  );
};

const isIcoUrl = (url: string): boolean => {
  return url.toLowerCase().endsWith(".ico");
};

const downloadIcon = async (
  shop: GameShop,
  objectId: string,
  iconUrls: (string | null | undefined)[]
): Promise<string | null> => {
  const validUrls = iconUrls.filter(isValidUrl);

  if (validUrls.length === 0) {
    logger.warn("No valid icon URLs found for game shortcut");
    return null;
  }

  const urlHash = Buffer.from(validUrls[0])
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 16);
  const iconDir = path.join(ASSETS_PATH, `${shop}-${objectId}`);
  const iconPath = path.join(iconDir, `icon-${urlHash}.ico`);

  try {
    if (fs.existsSync(iconPath)) {
      return iconPath;
    }
  } catch {
    // Ignore fs errors
  }

  fs.mkdirSync(iconDir, { recursive: true });

  for (const iconUrl of validUrls) {
    try {
      logger.log(`Trying to download/read icon from: ${iconUrl}`);

      let imageBuffer: Buffer;
      if (iconUrl.startsWith("local:")) {
        const localPath = iconUrl.slice("local:".length);
        imageBuffer = fs.readFileSync(localPath);
      } else {
        const response = await fetch(iconUrl);
        imageBuffer = Buffer.from(await response.arrayBuffer());
      }

      if (isIcoUrl(iconUrl)) {
        fs.writeFileSync(iconPath, imageBuffer);
        logger.log(`Copied ICO directly to: ${iconPath}`);
        return iconPath;
      }

      const pngBuffer = await sharp(imageBuffer)
        .resize(256, 256, { fit: "cover" })
        .png()
        .toBuffer();
      const icoBuffer = await pngToIco(pngBuffer);
      fs.writeFileSync(iconPath, icoBuffer);

      logger.log(`Successfully created icon at: ${iconPath}`);
      return iconPath;
    } catch (error) {
      logger.warn(`Failed to convert icon from ${iconUrl}:`, error);
    }
  }

  logger.error("Failed to download/convert game icon from any source");
  return null;
};

const buildRunDeepLink = (shop: GameShop, objectId: string) => {
  const query = new URLSearchParams({
    shop,
    objectId,
  });

  return `protonforge://run?${query.toString()}`;
};

const quoteLinuxExecArg = (value: string) => {
  return `"${value.replaceAll('"', '\\"')}"`;
};

const getShortcutArguments = (deepLink: string) => {
  const deepLinkArgument = quoteLinuxExecArg(deepLink);

  if (process.defaultApp && process.argv.length >= 2) {
    const appEntry = path.resolve(process.argv[1]);
    const appEntryArgument = quoteLinuxExecArg(appEntry);

    return `${appEntryArgument} ${deepLinkArgument}`;
  }

  return deepLinkArgument;
};

const createGameShortcut = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  location: ShortcutLocation
): Promise<boolean> => {
  const gameKey = storeKeys.game(shop, objectId);
  const game = await gamesStore.get(gameKey);

  if (!game) {
    throw new Error("Could not find this game in your library.");
  }

  if (location === "start_menu") {
    throw new Error("Start Menu shortcuts are not available on Linux.");
  }

  const shortcutName =
    removeSymbolsFromName(game.title).trim() || game.objectId;
  const deepLink = buildRunDeepLink(shop, objectId);
  const shortcutArguments = getShortcutArguments(deepLink);
  const outputPath = SystemPath.getPath("desktop");

  if (!outputPath) {
    throw new Error("Could not resolve the shortcut output folder.");
  }

  fs.mkdirSync(outputPath, { recursive: true });

  const assets = await getGameAssets(objectId, shop);
  const iconPath = await downloadIcon(shop, objectId, [
    game.customIconUrl,
    assets?.iconUrl,
    game.iconUrl,
    assets?.coverImageUrl,
  ]);

  const { execPath } = process;
  const success = fs.existsSync(
    path.join(outputPath, `${shortcutName}.desktop`)
  );

  if (!success) {
    const desktopContent = `[Desktop Entry]
Type=Application
Name=${shortcutName}
Exec=${execPath} ${shortcutArguments}
${iconPath ? `Icon=${iconPath}` : ""}
Terminal=false
Categories=Game;
`;

    fs.writeFileSync(
      path.join(outputPath, `${shortcutName}.desktop`),
      desktopContent
    );
    logger.info(
      `[createGameShortcut] Created desktop shortcut: ${shortcutName}`
    );
  }

  return true;
};

registerEvent("createGameShortcut", createGameShortcut);

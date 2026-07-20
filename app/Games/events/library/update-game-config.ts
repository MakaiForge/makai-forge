import { registerEvent } from "@main/events/register-event";
import { gamesStore, storeKeys } from "@main/store";
import type { GameShop } from "@types";
import { setSteamGameProton } from "@main/services/steam-config-vdf";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const getGamesFolder = () => {
  const userDataPath = app.getPath("userData");
  return path.join(userDataPath, "games");
};

const saveGameJson = async (
  objectId: string,
  gameData: Record<string, unknown>
) => {
  const folder = getGamesFolder();
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  const filePath = path.join(folder, `${objectId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(gameData, null, 2), "utf-8");
};

interface GameConfigUpdate {
  prefix?: string;
  winePrefixPath?: string;
  protonVersion?: string;
  protonPath?: string;
  wineVersion?: string;
  gameArgs?: string;
  launchOptions?: string;
  prelaunchCommand?: string;
  postexitCommand?: string;
  env?: Record<string, string>;
  mangoHud?: boolean;
  autoRunMangohud?: boolean;
  gameMode?: boolean;
  autoRunGamemode?: boolean;
  dxvk?: boolean;
  esync?: boolean;
  fsync?: boolean;
  protonAddons?: string[];
  containerCommand?: string;
  resolution?: string;
  fpsLimit?: string;
  vsync?: string;
  renderingMode?: string;
  videoDriver?: string;
  dxvkVersion?: string;
  vulkan?: boolean;
  frameThrottle?: string;
  audioDriver?: string;
  audioChannels?: string;
  audioSampleRate?: string;
  audioInBackground?: boolean;
  threadedD3D?: boolean;
  preferSystemLibs?: boolean;
  dllOverrides?: string;
  dlls?: string[];
  winetricks?: string;
  language?: string;
  locale?: string;
  vkd3d?: boolean;
  textures?: boolean;
  dxvkAsync?: boolean;
  amdFsr?: boolean;
  amdFsrSharpness?: string;
  fluidResolution?: boolean;
  superResolution?: boolean;
  esyncManual?: boolean;
  fsyncManual?: boolean;
  enableEac?: boolean;
  enableBattlEye?: boolean;
  vkd3dVersion?: string;
  d3dExtras?: boolean;
  d3dExtrasVersion?: string;
  virtualDesktop?: boolean;
  wineDesktop?: string;
  dpiScaling?: boolean;
  explicitDpi?: string;
  mouseWarpOverride?: string;
  graphicsBackend?: string;
  isDeleted?: boolean;
}

const updateGameConfig = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  config: GameConfigUpdate
) => {
  const gameKey = storeKeys.game(shop, objectId);

  const existingGame = await gamesStore.get(gameKey);
  if (!existingGame) {
    throw new Error("Game not found");
  }

  const updatedGame = {
    ...existingGame,
    ...config,
  };

  await gamesStore.put(gameKey, updatedGame);

  await saveGameJson(objectId, updatedGame);

  if (shop === "steam" && "protonVersion" in config) {
    await setSteamGameProton(
      objectId,
      config.protonVersion && config.protonVersion !== "Undefined"
        ? config.protonVersion
        : null,
    );
  }

  return updatedGame;
};

registerEvent("updateGameConfig", updateGameConfig);

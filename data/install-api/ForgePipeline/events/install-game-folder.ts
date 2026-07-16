import { registerEvent } from "@main/events/register-event";
import path from "node:path";
import fs from "node:fs";
import { GameShop } from "@types";
import { downloadsStore, gamesStore, storeKeys } from "@main/store";
import { getDownloadsPath } from "@main/events/helpers/get-downloads-path";
import { Wine } from "@main/services";
import { installGame } from "@game-launcher/install/install-game";

interface InstallGameExeResult {
  success: boolean;
  wasInstaller: boolean;
  suggestedExes: {
    path: string;
    fileName: string;
    fileSize: number;
  }[];
  prefixDriveCPath: string;
  suggestedBasePath: string;
}

const emptyResult: InstallGameExeResult = {
  success: false,
  wasInstaller: false,
  suggestedExes: [],
  prefixDriveCPath: "",
  suggestedBasePath: "",
};

const installGameExe = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
): Promise<InstallGameExeResult> => {
  const gameKey = storeKeys.game(shop, objectId);
  const [download, game] = await Promise.all([
    downloadsStore.get(gameKey),
    gamesStore.get(gameKey),
  ]);

  if (!download?.folderName) return emptyResult;

  const sourcePath = path.join(
    download.downloadPath ?? (await getDownloadsPath()),
    download.folderName
  );

  if (!fs.existsSync(sourcePath)) return emptyResult;

  const winePrefixPath = Wine.getEffectivePrefixPath(
    game?.winePrefixPath,
    objectId
  );

  if (!winePrefixPath) return emptyResult;

  const driveCPath = path.join(winePrefixPath, "drive_c");

  let filePath: string;
  if (fs.lstatSync(sourcePath).isFile()) {
    filePath = sourcePath;
  } else {
    const KNOWN_INSTALLER_EXES = ["setup.exe", "install.exe", "autorun.exe"];
    let found: string | null = null;
    for (const name of KNOWN_INSTALLER_EXES) {
      const p = path.join(sourcePath, name);
      if (fs.existsSync(p)) { found = p; break; }
    }
    filePath = found ?? sourcePath;
  }

  if (!fs.existsSync(filePath)) return emptyResult;

  const result = await installGame(filePath, {
    prefixPath: winePrefixPath,
    protonPath: game?.protonPath ?? "",
    gameId: objectId,
    existingExePath: game?.executablePath,
  });

  const suggestedExes = result.candidates.map((c) => ({
    path: c.path,
    fileName: c.name,
    fileSize: c.size,
  }));

  return {
    success: true,
    wasInstaller: suggestedExes.length > 0,
    suggestedExes,
    prefixDriveCPath: driveCPath,
    suggestedBasePath: result.suggested_dir ?? driveCPath,
  };
};

registerEvent("installGameExe", installGameExe);

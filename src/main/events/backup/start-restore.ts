import { registerEvent } from "../register-event";
import { db, storeKeys } from "@main/store";
import { DropboxProvider } from "@main/services/backup/providers/dropbox";
import { AppBoxProvider } from "@main/services/backup/providers/appbox";
import { setSteamGameProton } from "@main/services/steam-config-vdf";
import { WindowManager } from "@main/services";
import path from "node:path";
import fs from "node:fs";
import * as tar from "tar";
import { app } from "electron";
import { gamesStore } from "@main/store";

const startRestore = async (
  _event: Electron.IpcMainInvokeEvent
): Promise<{ success: boolean; error?: string }> => {
  let auth: any;
  try {
    auth = await db.get(storeKeys.backupAuth, { valueEncoding: "json" });
  } catch {
    return { success: false, error: "Nenhuma conta de backup conectada" };
  }

  let provider;
  const saveToken = async (newToken: string) => {
    const updated = { ...auth, accessToken: newToken, expiresAt: Date.now() + 14400000 };
    await db.put(storeKeys.backupAuth, updated).catch(() => {});
  };
  switch (auth.provider) {
    case "dropbox":
      provider = new DropboxProvider(auth, saveToken);
      break;
    case "appbox":
      provider = new AppBoxProvider(auth.accessToken);
      break;
    default:
      return { success: false, error: `Provedor não suportado: ${auth.provider}` };
  }

  const restoreBase = path.join(app.getPath("userData"), "RestoreTemp");
  fs.mkdirSync(restoreBase, { recursive: true });

  try {
    WindowManager.mainWindow?.webContents.send("on-backup-progress", {
      percent: 10,
      status: "Listando backups disponíveis...",
    });

    const remoteFiles = await provider.listFiles("ProtonForgeBackups");
    const backupFile = remoteFiles.find((f) => f.name === "games-backup.tar");

    if (!backupFile) {
      throw new Error("Nenhum backup encontrado");
    }

    WindowManager.mainWindow?.webContents.send("on-backup-progress", {
      percent: 15,
      status: `Baixando ${backupFile.name}...`,
    });

    await provider.download(
      `ProtonForgeBackups/${backupFile.name}`,
      path.join(restoreBase, "games-backup.tar")
    );

    WindowManager.mainWindow?.webContents.send("on-backup-progress", {
      percent: 50,
      status: "Extraindo backup...",
    });

    await tar.extract({
      file: path.join(restoreBase, "games-backup.tar"),
      cwd: restoreBase,
    });

    const jsonPath = path.join(restoreBase, "games-backup.json");
    if (fs.existsSync(jsonPath)) {
      const raw = fs.readFileSync(jsonPath, "utf-8");
      const games = JSON.parse(raw);

      for (let g = 0; g < games.length; g++) {
        const game = games[g];
        WindowManager.mainWindow?.webContents.send("on-backup-progress", {
          percent: 50 + Math.round((g / games.length) * 40),
          status: `Restaurando ${game.title || game.objectId}...`,
        });

        const key = `${game.shop}:${game.objectId}`;
        await gamesStore.put(key, game);

        if (game.shop === "steam" && game.protonVersion) {
          await setSteamGameProton(game.objectId, game.protonVersion);
        }
      }

      WindowManager.mainWindow?.webContents.send("on-backup-progress", {
        percent: 95,
        status: "Sincronizando configurações com a Steam...",
      });
    }

    WindowManager.mainWindow?.webContents.send("on-backup-progress", {
      percent: 100,
      status: "Restauração concluída",
    });

    try {
      await fs.promises.rm(restoreBase, { recursive: true });
    } catch { }

    return { success: true };
  } catch (err: any) {
    WindowManager.mainWindow?.webContents.send("on-backup-error", {
      message: err.message,
    });
    return { success: false, error: err.message };
  }
};

registerEvent("backupRestore", startRestore);

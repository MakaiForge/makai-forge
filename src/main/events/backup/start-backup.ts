import { registerEvent } from "../register-event";
import { db, storeKeys } from "@main/store";
import { BackupManager } from "@main/services/backup/backup-manager";
import { DropboxProvider } from "@main/services/backup/providers/dropbox";
import { AppBoxProvider } from "@main/services/backup/providers/appbox";
import { WindowManager } from "@main/services";

const startBackup = async (
  _event: Electron.IpcMainInvokeEvent
): Promise<{
  success: boolean;
  error?: string;
  steamCount?: number;
  customCount?: number;
  totalSizeBytes?: number;
  totalSizeMb?: number;
  timestamp?: string;
}> => {
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

  const manager = new BackupManager();

  try {
    const result = await manager.runBackup(provider, (progress) => {
      WindowManager.mainWindow?.webContents.send(
        "on-backup-progress",
        progress
      );
    });

    return {
      success: true,
      steamCount: result.steamCount,
      customCount: result.customCount,
      totalSizeBytes: result.totalSizeBytes,
      totalSizeMb: Math.round((result.totalSizeBytes / 1024 / 1024) * 100) / 100,
      timestamp: result.timestamp,
    };
  } catch (err: any) {
    WindowManager.mainWindow?.webContents.send("on-backup-error", {
      message: err.message,
    });
    return { success: false, error: err.message };
  }
};

registerEvent("backupStart", startBackup);

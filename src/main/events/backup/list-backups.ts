import { registerEvent } from "../register-event";
import { db, storeKeys } from "@main/store";
import { DropboxProvider } from "@main/services/backup/providers/dropbox";
import { AppBoxProvider } from "@main/services/backup/providers/appbox";

const listBackups = async (): Promise<{
  success: boolean;
  exists?: boolean;
  file?: { name: string; sizeBytes: number; lastModified: string };
  error?: string;
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

  try {
    const files = await provider.listFiles("ProtonForgeBackups");
    const backup = files.find((f) => f.name === "games-backup.tar");

    if (backup) {
      return { success: true, exists: true, file: { name: backup.name, sizeBytes: backup.sizeBytes, lastModified: backup.lastModified } };
    }

    return { success: true, exists: false };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

registerEvent("backupListFiles", listBackups);

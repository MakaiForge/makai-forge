import { registerEvent } from "@main/events/register-event";
import { ModBackupService, type BackupMeta } from "@mods/services/mod-backup-service";

registerEvent("listBackups", async (_event, gameId: string, profile: string): Promise<BackupMeta[]> => {
  return ModBackupService.listBackups(gameId, profile);
});

registerEvent("createBackup", async (_event, gameId: string, profile: string): Promise<BackupMeta> => {
  return ModBackupService.createBackup(gameId, profile);
});

registerEvent("restoreBackup", async (_event, gameId: string, profile: string, backupDir: string): Promise<boolean> => {
  return ModBackupService.restoreBackup(gameId, profile, backupDir);
});

registerEvent("setBackupKept", async (_event, backupDir: string, kept: boolean): Promise<void> => {
  ModBackupService.setKept(backupDir, kept);
});

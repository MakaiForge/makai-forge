import { ipcRenderer } from "electron";

export interface BackupVersion {
  timestamp: string;
  date: string;
  files: { name: string; path: string; sizeBytes: number; lastModified: string }[];
  totalSizeBytes: number;
}

export interface BackupStartResult {
  success: boolean;
  error?: string;
  steamCount?: number;
  localCount?: number;
  hadJsons?: boolean;
  totalSizeMb?: number;
  timestamp?: string;
}

export const backupAPI = {
  backupGetStatus: () => ipcRenderer.invoke("backupGetStatus"),
  backupOAuthLogin: (provider: string) =>
    ipcRenderer.invoke("backupOAuthLogin", provider),
  backupOAuthLogout: () => ipcRenderer.invoke("backupOAuthLogout"),
  backupStart: (): Promise<BackupStartResult> =>
    ipcRenderer.invoke("backupStart"),
  backupRestore: () =>
    ipcRenderer.invoke("backupRestore"),
  backupListFiles: (): Promise<{ success: boolean; exists?: boolean; file?: { name: string; sizeBytes: number; lastModified: string }; error?: string }> =>
    ipcRenderer.invoke("backupListFiles"),
  onBackupProgress: (
    cb: (progress: { percent: number; status: string }) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: { percent: number; status: string }
    ) => cb(progress);
    ipcRenderer.on("on-backup-progress", listener);
    return () => ipcRenderer.removeListener("on-backup-progress", listener);
  },
  onBackupError: (cb: (error: { message: string }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      error: { message: string }
    ) => cb(error);
    ipcRenderer.on("on-backup-error", listener);
    return () => ipcRenderer.removeListener("on-backup-error", listener);
  },
};

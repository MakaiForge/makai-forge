export const backupService = {
  async getStatus() {
    return window.electron.backupGetStatus();
  },

  async login(provider: string) {
    return window.electron.backupOAuthLogin(provider);
  },

  async logout() {
    return window.electron.backupOAuthLogout();
  },

  async startBackup() {
    return window.electron.backupStart();
  },

  async restore(files: string[]) {
    return window.electron.backupRestore(files);
  },

  async listFiles() {
    return window.electron.backupListFiles();
  },

  onProgress(cb: (progress: { percent: number; status: string }) => void) {
    return window.electron.onBackupProgress(cb);
  },

  onError(cb: (error: { message: string }) => void) {
    return window.electron.onBackupError(cb);
  },
};

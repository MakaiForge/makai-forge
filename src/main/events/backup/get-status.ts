import { registerEvent } from "../register-event";
import { db, storeKeys } from "@main/store";

export interface BackupAuthStatus {
  loggedIn: boolean;
  provider?: string;
  connectedAt?: number;
}

const getStatus = async (): Promise<BackupAuthStatus> => {
  try {
    const auth = await db.get(storeKeys.backupAuth, { valueEncoding: "json" });
    if (!auth) return { loggedIn: false };

    const isExpired = Date.now() > (auth.expiresAt || 0);
    const canRefresh = Boolean(auth.refreshToken);

    if (isExpired && !canRefresh) {
      return { loggedIn: false };
    }

    return {
      loggedIn: true,
      provider: auth.provider,
      connectedAt: auth.connectedAt,
    };
  } catch {
    return { loggedIn: false };
  }
};

registerEvent("backupGetStatus", getStatus);

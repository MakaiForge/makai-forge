import axios from "axios";
import { app } from "electron";
import { registerEvent } from "../register-event";
import { db, storeKeys } from "@main/store";

const SITE_URL = app.isPackaged
  ? "https://makai-forge.store"
  : "http://localhost:8788";

const authLogout = async (_event: Electron.IpcMainInvokeEvent) => {
  try {
    const stored = await db.get<any>(storeKeys.makaiAuth).catch(() => null);
    if (stored) {
      const data = typeof stored === "string" ? JSON.parse(stored) : stored;
      const { token } = data;
      await axios.post(
        `${SITE_URL}/api/auth/logout`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
    }
  } catch {
    // Ignore errors on logout
  }

  await db.del(storeKeys.makaiAuth).catch(() => {});
  return { success: true };
};

registerEvent("authLogout", authLogout);

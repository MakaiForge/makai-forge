import { registerEvent } from "../register-event";
import axios from "axios";
import { app } from "electron";
import { db, storeKeys } from "@main/store";

const SITE_URL = app.isPackaged
  ? "https://makai-forge.store"
  : "http://localhost:8788";

const banUser = async (
  _event: Electron.IpcMainInvokeEvent,
  userId: number,
  duration: number,
  reason: string
) => {
  try {
    const stored = await db.get<any>(storeKeys.makaiAuth).catch(() => null);
    const data = stored && typeof stored === "string" ? JSON.parse(stored) : stored;
    if (!data?.token) return { error: "Not authenticated" };

    const response = await axios.put(
      `${SITE_URL}/api/admin/mute/${userId}`,
      { duration, reason: reason || "" },
      { headers: { Authorization: `Bearer ${data.token}` } }
    );
    return response.data;
  } catch (error: any) {
    return { error: error?.response?.data?.error || "Failed to ban user" };
  }
};

registerEvent("banUser", banUser);

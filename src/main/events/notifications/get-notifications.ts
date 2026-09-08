import axios from "axios";
import { app } from "electron";
import { registerEvent } from "../register-event";
import { db, storeKeys } from "@main/store";

const SITE_URL = app.isPackaged
  ? "https://makai-forge.store"
  : "http://localhost:8788";

const getNotifications = async () => {
  const stored = await db.get<any>(storeKeys.makaiAuth).catch(() => null);
  if (!stored) return { notifications: [] };
  try {
    const data = typeof stored === "string" ? JSON.parse(stored) : stored;
    if (!data.token) return { notifications: [] };
    const { token } = data;
    const response = await axios.get(
      `${SITE_URL}/api/notifications`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
  } catch {
    return { notifications: [] };
  }
};

const getUnreadNotificationsCount = async () => {
  const result = await getNotifications();
  if (!result.notifications) return 0;
  return result.notifications.filter((n: any) => !n.read).length;
};

const markNotificationsRead = async (
  _event: Electron.IpcMainInvokeEvent,
  ids: number[]
) => {
  const stored = await db.get<any>(storeKeys.makaiAuth).catch(() => null);
  if (!stored) return { success: true };
  try {
    const data = typeof stored === "string" ? JSON.parse(stored) : stored;
    if (!data.token) return { success: true };
    const { token } = data;
    await axios.post(
      `${SITE_URL}/api/notifications`,
      { ids },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch {
    // ignore
  }
  return { success: true };
};

registerEvent("getNotifications", getNotifications);
registerEvent("getUnreadNotificationsCount", getUnreadNotificationsCount);
registerEvent("markNotificationsRead", markNotificationsRead);

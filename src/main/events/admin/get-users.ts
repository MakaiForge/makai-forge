import { registerEvent } from "../register-event";
import axios from "axios";
import { app } from "electron";
import { db, storeKeys } from "@main/store";

const SITE_URL = app.isPackaged
  ? "https://makai-forge.store"
  : "http://localhost:8788";

const getUsers = async (_event: Electron.IpcMainInvokeEvent) => {
  try {
    const stored = await db.get<any>(storeKeys.makaiAuth).catch(() => null);
    const data = stored && typeof stored === "string" ? JSON.parse(stored) : stored;
    if (!data?.token) return [];

    const response = await axios.get(`${SITE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${data.token}` },
    });
    return response.data.users || [];
  } catch {
    return [];
  }
};

registerEvent("getUsers", getUsers);

import { registerEvent } from "../register-event";
import axios from "axios";
import { app } from "electron";
import { db, storeKeys } from "@main/store";

const SITE_URL = app.isPackaged
  ? "https://makai-forge.store"
  : "http://localhost:8788";

const deleteScript = async (_event: Electron.IpcMainInvokeEvent, scriptId: number) => {
  try {
    const stored = await db.get<any>(storeKeys.makaiAuth).catch(() => null);
    const data = stored && typeof stored === "string" ? JSON.parse(stored) : stored;
    if (!data?.token) return { error: "Not authenticated" };

    const response = await axios.delete(
      `${SITE_URL}/api/scripts/${scriptId}`,
      {
        headers: { Authorization: `Bearer ${data.token}` },
      }
    );
    return response.data;
  } catch {
    return { error: "Failed to delete script" };
  }
};

registerEvent("deleteScript", deleteScript);

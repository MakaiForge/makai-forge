import { registerEvent } from "../register-event";
import axios from "axios";
import { app } from "electron";
import { db, storeKeys } from "@main/store";
import type { GameShop } from "@types";

const SITE_URL = app.isPackaged
  ? "https://makai-forge.store"
  : "http://localhost:8788";

const getScriptsByGame = async (
  _event: Electron.IpcMainInvokeEvent,
  _shop: GameShop,
  objectId: string
) => {
  try {
    const stored = await db.get<any>(storeKeys.makaiAuth).catch(() => null);
    const headers: Record<string, string> = {};
    const data = stored && typeof stored === "string" ? JSON.parse(stored) : stored;
    if (data?.token) {
      headers.Authorization = `Bearer ${data.token}`;
    }
    const response = await axios.get(
      `${SITE_URL}/api/scripts?game_id=${objectId}`,
      { headers }
    );
    return response.data;
  } catch {
    return [];
  }
};

registerEvent("getScriptsByGame", getScriptsByGame);

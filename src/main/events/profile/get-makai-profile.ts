import axios from "axios";
import { app } from "electron";
import { registerEvent } from "../register-event";
import { db, storeKeys } from "@main/store";

const SITE_URL = app.isPackaged
  ? "https://makai-forge.store"
  : "http://localhost:8788";

const getMakaiProfile = async () => {
  const stored = await db.get<any>(storeKeys.makaiAuth).catch(() => null);
  if (!stored) return null;
  try {
    const data = typeof stored === "string" ? JSON.parse(stored) : stored;
    if (!data.token) return null;
    const response = await axios.get(`${SITE_URL}/api/auth/profile`, {
      headers: { Authorization: `Bearer ${data.token}` },
    });
    return response.data;
  } catch {
    return null;
  }
};

registerEvent("getMakaiProfile", getMakaiProfile);

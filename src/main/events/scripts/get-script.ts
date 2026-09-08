import { registerEvent } from "../register-event";
import axios from "axios";
import { app } from "electron";

const SITE_URL = app.isPackaged
  ? "https://makai-forge.store"
  : "http://localhost:8788";

const getScriptById = async (
  _event: Electron.IpcMainInvokeEvent,
  scriptId: string
) => {
  try {
    const response = await axios.get(`${SITE_URL}/api/scripts/${scriptId}`, {
      withCredentials: true,
    });
    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return { error: "Script not found" };
    }
    return { error: "Failed to fetch script" };
  }
};

registerEvent("getScriptById", getScriptById);

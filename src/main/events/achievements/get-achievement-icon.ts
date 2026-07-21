import { app } from "electron";
import { registerEvent } from "../register-event";

const getAchievementIconUrl = async (
  _event: Electron.IpcMainInvokeEvent,
  iconPath: string | null | undefined
): Promise<string | null> => {
  if (!iconPath) return null;
  const filename = iconPath.split("/").pop();
  if (!filename) return null;
  const fs = await import("fs");
  const fullPath = app.getAppPath() + "/app/_assets/assets/icons/achievements/" + filename;
  if (fs.existsSync(fullPath)) {
    return "local:" + fullPath;
  }
  return null;
};

registerEvent("getAchievementIconUrl", getAchievementIconUrl);

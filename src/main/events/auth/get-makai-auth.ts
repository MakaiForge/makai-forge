import { registerEvent } from "../register-event";
import { db, storeKeys } from "@main/store";

const getMakaiAuth = async () => {
  const stored = await db.get<any>(storeKeys.makaiAuth).catch(() => null);
  if (!stored) return null;
  if (typeof stored === "string") {
    try {
      return JSON.parse(stored);
    } catch {
      await db.del(storeKeys.makaiAuth).catch(() => {});
      return null;
    }
  }
  if (!stored.token || !stored.user) {
    await db.del(storeKeys.makaiAuth).catch(() => {});
    return null;
  }
  return stored;
};

registerEvent("getMakaiAuth", getMakaiAuth);

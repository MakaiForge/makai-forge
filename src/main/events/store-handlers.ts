import { registerEvent } from "./register-event";
import { db, downloadSourcesStore, themesStore, localNotificationsStore } from "@main/store";

const SUBLEVEL_DB_MAP: Record<string, any> = {
  downloadSources: downloadSourcesStore,
  themes: themesStore,
  localNotifications: localNotificationsStore,
};

const getStore = (name?: string | null) => {
  if (!name) return db;
  return SUBLEVEL_DB_MAP[name] || db;
};

const storeGet = async (_event: Electron.IpcMainInvokeEvent, key: string, sublevelName?: string | null) => {
  try {
    return await getStore(sublevelName).get(key);
  } catch {
    return null;
  }
};
registerEvent("storeGet", storeGet);

const storePut = async (_event: Electron.IpcMainInvokeEvent, key: string, value: unknown, sublevelName?: string | null) => {
  await getStore(sublevelName).put(key, value);
};
registerEvent("storePut", storePut);

registerEvent("storeDel", async (_event, key: string, sublevelName?: string | null) => {
  await getStore(sublevelName).del(key);
});

registerEvent("storeClear", async (_event, sublevelName: string) => {
  await getStore(sublevelName).clear();
});

registerEvent("storeValues", async (_event, sublevelName: string) => {
  return getStore(sublevelName).values().all();
});

registerEvent("storeIterator", async (_event, sublevelName: string) => {
  return getStore(sublevelName).iterator().all();
});

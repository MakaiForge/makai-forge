import { registerEvent } from "@main/events/register-event";
import { ModStorageService } from "@main/services";

registerEvent("modsStoreGet", async (_event, key: string) => {
  return ModStorageService.get(key) ?? null;
});

registerEvent("modsStorePut", async (_event, key: string, value: any) => {
  ModStorageService.put(key, value);
  return true;
});

registerEvent("modsStoreDel", async (_event, key: string) => {
  ModStorageService.delete(key);
  return true;
});

import { registerEvent } from "../register-event";
import { db, storeKeys } from "@main/store";

const oauthLogout = async (): Promise<void> => {
  await db.del(storeKeys.backupAuth);
};

registerEvent("backupOAuthLogout", oauthLogout);

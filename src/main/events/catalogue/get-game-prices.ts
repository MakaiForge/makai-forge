import { registerEvent } from "../register-event";
import { getGamePrices } from "@main/services/price-lookup";
import { db, storeKeys } from "@main/store";
import { GG_DEALS_API_KEY } from "@main/gg-deals-key";

const getGamePricesHandler = async (
  _event: Electron.IpcMainInvokeEvent,
  steamAppId: string,
  language?: string
) => {
  const userPreferences = await db
    .get<string, { ggDealsApiKey?: string } | null>(storeKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);

  const ggDealsKey = userPreferences?.ggDealsApiKey || GG_DEALS_API_KEY || undefined;
  return getGamePrices(steamAppId, language, ggDealsKey);
};

registerEvent("getGamePrices", getGamePricesHandler);

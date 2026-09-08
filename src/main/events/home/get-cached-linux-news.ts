import { registerEvent } from "../register-event";
import { getCachedNews } from "@main/services/linux-news";

registerEvent("getLinuxNewsCached", async (_event, language?: string) => {
  return getCachedNews(language);
});

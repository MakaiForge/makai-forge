import { registerEvent } from "../register-event";
import { getNews } from "@main/services/linux-news";

registerEvent("getLinuxNews", async (_event, language?: string) => {
  return getNews(language);
});

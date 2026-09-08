import { app } from "electron";
import { registerEvent } from "../register-event";

const getSiteUrl = async () => {
  return app.isPackaged
    ? "https://makai-forge.store"
    : "http://localhost:8788";
};

registerEvent("getSiteUrl", getSiteUrl);

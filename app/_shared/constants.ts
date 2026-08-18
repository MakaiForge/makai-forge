import { Downloader } from "@shared";

export const VERSION_CODENAME = "Split the Atom";

export const DOWNLOADER_NAME = {
  [Downloader.Torrent]: "Torrent",
  [Downloader.Gofile]: "Gofile",
  [Downloader.PixelDrain]: "PixelDrain",
  [Downloader.Datanodes]: "Datanodes",
  [Downloader.Mediafire]: "Mediafire",
  [Downloader.Buzzheavier]: "Buzzheavier",
  [Downloader.FuckingFast]: "FuckingFast",
  [Downloader.Nimbus]: "Nimbus",
  [Downloader.VikingFile]: "VikingFile",
  [Downloader.Rootz]: "Rootz",
  [Downloader.Direct]: "Download Direto",
};

export const MAX_MINUTES_TO_SHOW_IN_PLAYTIME = 120;

export const THEME_WEB_STORE_URL = "https://github.com/lucasgertke11-bot/Makai-forger";

/** Labels de categorias de runners/emuladores — compartilhado entre módulos */
export const CATEGORY_LABELS: Record<string, string> = {
  nintendo: "Nintendo",
  sony: "Sony",
  sega: "Sega",
  arcade: "Arcade",
  computers: "Computadores",
  microsoft: "Microsoft",
  multi: "Multiplataforma",
  obscure: "Obscuro",
};

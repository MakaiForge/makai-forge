import { RunnerDefinition } from "../../types";

export const duckstation: RunnerDefinition = {
  id: "duckstation",
  humanName: "DuckStation",
  description: "Emulador de PlayStation 1 (PSX)",
  category: "sony",
  platforms: ["Sony PlayStation"],
  repo: { owner: "stenzek", repo: "duckstation" },
  downloadUrl: "https://github.com/stenzek/duckstation/releases/latest/download/DuckStation-x64.AppImage",
  executablePath: "DuckStation-x64.AppImage",
  launchArgs: (romPath) => [romPath],
  assetPattern: "DuckStation-x64.AppImage",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/psx-roms/" },
    { name: "CoolROM", url: "https://coolrom.com.au/roms/psx/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/psx.htm" },
  ],
};

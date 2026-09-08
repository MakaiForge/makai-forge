import { RunnerDefinition } from "../../types";

export const cemu: RunnerDefinition = {
  id: "cemu",
  humanName: "Cemu",
  description: "Emulador de Wii U",
  category: "nintendo",
  platforms: ['Nintendo Wii U'],
  repo: { owner: "cemu-project", repo: "Cemu" },
  executablePath: "Cemu",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*.AppImage",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

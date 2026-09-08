import { RunnerDefinition } from "../../types";

export const mgba: RunnerDefinition = {
  id: "mgba",
  humanName: "mGBA",
  description: "Emulador de Game Boy Advance / Game Boy / Game Boy Color",
  category: "nintendo",
  platforms: ['Game Boy Advance', 'Game Boy', 'Game Boy Color'],
  repo: { owner: "mgba-emu", repo: "mgba" },
  executablePath: "mgba",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*-appimage-x64.appimage",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

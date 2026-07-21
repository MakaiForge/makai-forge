import { RunnerDefinition } from "../../types";

export const mesen: RunnerDefinition = {
  id: "mesen",
  humanName: "MesenCE",
  description: "Emulador multi-sistema: NES, SNES, GB, GBA, PCE, SMS, GG, WS",
  category: "nintendo",
  platforms: ['NES', 'SNES', 'Game Boy', 'Game Boy Advance', 'PC Engine', 'Master System', 'Game Gear', 'WonderSwan'],
  repo: { owner: "SourMesen", repo: "Mesen2" },
  executablePath: "mesen",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*_Linux_x64.zip",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

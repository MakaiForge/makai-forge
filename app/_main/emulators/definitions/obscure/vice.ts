import { RunnerDefinition } from "../../types";

export const vice: RunnerDefinition = {
  id: "vice",
  humanName: "VICE",
  description: "Emulador de Commodore 64 / 128 / VIC-20 / PET",
  category: "obscure",
  platforms: ['Commodore 64', 'Commodore 128', 'VIC-20', 'PET'],
  repo: { owner: "VICE-Team", repo: "svn-mirror" },
  executablePath: "x64",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*.tar.gz",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

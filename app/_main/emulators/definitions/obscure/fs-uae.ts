import { RunnerDefinition } from "../../types";

export const fsUae: RunnerDefinition = {
  id: "fs-uae",
  humanName: "FS-UAE",
  description: "Emulador de Amiga (500/1200/CD32)",
  category: "obscure",
  platforms: ['Commodore Amiga'],
  repo: { owner: "FrodeSolheim", repo: "fs-uae" },
  executablePath: "fs-uae",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*_Linux_x86-64.tar.xz",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

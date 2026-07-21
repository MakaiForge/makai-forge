import { RunnerDefinition } from "../../types";

export const zsnes: RunnerDefinition = {
  id: "zsnes",
  humanName: "ZSNES",
  description: "Emulador de Super Nintendo (SNES) — fork mantido para Linux moderno",
  category: "nintendo",
  platforms: ["Super Nintendo (SNES)"],
  repo: { owner: "pkgforge-dev", repo: "ZSNES-AppImage" },
  executablePath: "zsnes",
  launchArgs: (romPath) => [romPath],
  assetPattern: "x86_64",
  isAbandoned: false,
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/roms/snes/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/snes-roms.htm" },
  ],
};

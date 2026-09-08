import { RunnerDefinition } from "../../types";

export const snes9x: RunnerDefinition = {
  id: "snes9x",
  humanName: "SNES9x",
  description: "Emulador de Super Nintendo (SNES) — preciso e rápido",
  category: "nintendo",
  platforms: ['Super Nintendo (SNES)'],
  repo: { owner: "snes9xgit", repo: "snes9x" },
  executablePath: "snes9x-gtk",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*.AppImage",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

import { RunnerDefinition } from "../../types";

export const bsnes: RunnerDefinition = {
  id: "bsnes",
  humanName: "bsnes",
  description: "Emulador de Super Nintendo (SNES) — focado em precisão",
  category: "nintendo",
  platforms: ['Super Nintendo (SNES)'],
repo: { owner: "bsnes-emu", repo: "bsnes" },
  executablePath: "bsnes",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*.tar.xz",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

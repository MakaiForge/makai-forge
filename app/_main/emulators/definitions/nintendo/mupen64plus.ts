import { RunnerDefinition } from "../../types";

export const mupen64plus: RunnerDefinition = {
  id: "mupen64plus",
  humanName: "Mupen64Plus",
  description: "Emulador de Nintendo 64",
  category: "nintendo",
  platforms: ['Nintendo 64'],
  repo: { owner: "mupen64plus", repo: "mupen64plus-core" },
  executablePath: "mupen64plus",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*-linux64-*.tar.gz",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

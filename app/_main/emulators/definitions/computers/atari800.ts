import { RunnerDefinition } from "../../types";

export const atari800: RunnerDefinition = {
  id: "atari800",
  humanName: "Atari800",
  description: "Emulador de Atari 8-bit (400/800/XL/XE) e 5200",
  category: "computers",
  platforms: ['Atari 8-bit', 'Atari 5200'],
  repo: { owner: "atari800", repo: "atari800" },
  executablePath: "atari800",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*-x86_64.AppImage",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

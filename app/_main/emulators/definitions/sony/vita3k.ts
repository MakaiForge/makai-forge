import { RunnerDefinition } from "../../types";

export const vita3k: RunnerDefinition = {
  id: "vita3k",
  humanName: "Vita3K",
  description: "Emulador experimental de PlayStation Vita",
  category: "sony",
  platforms: ['PlayStation Vita'],
  repo: { owner: "Vita3K", repo: "Vita3K" },
  executablePath: "Vita3K",
  launchArgs: (romPath) => [romPath],
  assetPattern: "Vita3K-x86_64.AppImage",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

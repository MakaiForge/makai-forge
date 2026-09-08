import { RunnerDefinition } from "../../types";

export const xemu: RunnerDefinition = {
  id: "xemu",
  humanName: "Xemu",
  description: "Emulador de Original Xbox",
  category: "microsoft",
  platforms: ['Microsoft Xbox'],
  repo: { owner: "xemu-project", repo: "xemu" },
  executablePath: "xemu",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*-x86_64.AppImage",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

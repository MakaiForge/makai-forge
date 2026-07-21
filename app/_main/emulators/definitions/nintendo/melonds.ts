import { RunnerDefinition } from "../../types";

export const melonds: RunnerDefinition = {
  id: "melonds",
  humanName: "melonDS",
  description: "Emulador de Nintendo DS",
  category: "nintendo",
  platforms: ['Nintendo DS'],
  repo: { owner: "MelonDS-emu", repo: "MelonDS" },
  executablePath: "melonDS",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*-appimage-x86_64.zip",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

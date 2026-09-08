import { RunnerDefinition } from "../../types";

export const flycast: RunnerDefinition = {
  id: "flycast",
  humanName: "Flycast",
  description: "Emulador de Sega Dreamcast, Naomi e Atomiswave",
  category: "sega",
  platforms: ["Sega Dreamcast", "Sega Naomi", "Atomiswave"],
  repo: { owner: "flyinghead", repo: "flycast" },
  executablePath: "flycast/flycast",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*-x86_64.AppImage",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/dreamcast-roms/" },
    { name: "CoolROM", url: "https://coolrom.com.au/roms/dreamcast/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/dreamcast-roms.htm" },
  ],
};

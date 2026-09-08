import { RunnerDefinition } from "../../types";

export const dolphin: RunnerDefinition = {
  id: "dolphin",
  humanName: "Dolphin",
  description: "Emulador de Nintendo GameCube e Wii",
  category: "nintendo",
  platforms: ["Nintendo GameCube", "Nintendo Wii"],
  repo: { owner: "dolphin-emu", repo: "dolphin" },
  executablePath: "dolphin-emu/Dolphin_Emulator.AppImage",
  launchArgs: (romPath) => ["--batch", "-e", romPath],
  assetPattern: "*.AppImage",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

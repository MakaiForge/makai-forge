import { RunnerDefinition } from "../../types";

export const mednafen: RunnerDefinition = {
  id: "mednafen",
  humanName: "Mednafen",
  description: "Emulador multi-sistema: NES, SNES, GB, GBA, PS1, Saturn, Genesis, SMS, PCE, Lynx, NGPC, WS, VB",
  category: "multi",
  platforms: ['NES', 'SNES', 'Game Boy', 'Game Boy Advance', 'PlayStation', 'Sega Saturn', 'Sega Genesis', 'Master System', 'PC Engine', 'Atari Lynx', 'Neo Geo Pocket', 'WonderSwan', 'Virtual Boy'],
  downloadUrl: "https://mednafen.github.io/releases/files/mednafen-1.32.1.tar.xz",
  executablePath: "mednafen",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*.tar.gz",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

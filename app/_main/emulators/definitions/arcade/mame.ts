import { RunnerDefinition } from "../../types";

export const mame: RunnerDefinition = {
  id: "mame",
  humanName: "MAME",
  description: "Emulador de Arcade (múltiplos sistemas) — o padrão ouro da emulação arcade",
  category: "arcade",
  platforms: ["Arcade", "Nintendo Game & Watch"],
  repo: { owner: "mamedev", repo: "mame" },
  executablePath: "mame/mame",
  launchArgs: (romPath) => ["-skip_gameinfo", romPath],
  assetPattern: "*lx.zip",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/arcade-roms/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/mame-roms.htm" },
    { name: "CoolROM", url: "https://coolrom.com.au/roms/mame/" },
  ],
};

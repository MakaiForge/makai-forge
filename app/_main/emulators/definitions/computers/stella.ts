import { RunnerDefinition } from "../../types";

export const stella: RunnerDefinition = {
  id: "stella",
  humanName: "Stella",
  description: "Emulador de Atari 2600 VCS",
  category: "computers",
  platforms: ["Atari 2600"],
  repo: { owner: "stella-emu", repo: "stella" },
  executablePath: "stella/stella",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*_amd64.deb",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/atari-2600-roms/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/atari-2600-roms.htm" },
    { name: "CoolROM", url: "https://coolrom.com.au/roms/atari-2600/" },
  ],
};

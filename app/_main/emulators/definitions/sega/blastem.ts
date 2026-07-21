import { RunnerDefinition } from "../../types";

export const blastem: RunnerDefinition = {
  id: "blastem",
  humanName: "BlastEm",
  description: "Emulador de Sega Mega Drive / Genesis e Master System",
  category: "sega",
  platforms: ["Sega Mega Drive", "Sega Genesis", "Sega Master System"],
  downloadUrl: "https://retrodev.com/blastem/nightlies/blastem64-0.6.3-pre-5e39a3334a65.tar.gz",
  executablePath: "blastem",
  launchArgs: (romPath) => [romPath],
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

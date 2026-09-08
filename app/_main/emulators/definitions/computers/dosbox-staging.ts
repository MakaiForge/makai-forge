import { RunnerDefinition } from "../../types";

export const dosboxStaging: RunnerDefinition = {
  id: "dosbox-staging",
  humanName: "DOSBox Staging",
  description: "Emulador de MS-DOS — versão moderna e ativa",
  category: "computers",
  platforms: ["MS-DOS"],
  repo: { owner: "dosbox-staging", repo: "dosbox-staging" },
  executablePath: "dosbox-staging/bin/dosbox",
  launchArgs: (romPath) => ["-conf", romPath],
  assetPattern: "*-linux-x86_64-*.tar.xz",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/dos-roms/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/dos-roms.htm" },
    { name: "CoolROM", url: "https://coolrom.com.au/roms/dos/" },
  ],
};

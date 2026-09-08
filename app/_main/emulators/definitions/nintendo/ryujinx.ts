import { RunnerDefinition } from "../../types";

export const ryujinx: RunnerDefinition = {
  id: "ryujinx",
  humanName: "Ryujinx",
  description: "Emulador de Nintendo Switch",
  category: "nintendo",
  platforms: ['Nintendo Switch'],
  downloadUrl: "https://git.ryujinx.app/Ryubing/Canary/releases/download/1.3.315/ryujinx-canary-1.3.315-x64.AppImage",
  executablePath: "Ryujinx",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*.AppImage",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

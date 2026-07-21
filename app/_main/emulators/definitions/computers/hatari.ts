import { RunnerDefinition } from "../../types";

export const hatari: RunnerDefinition = {
  id: "hatari",
  humanName: "Hatari",
  description: "Emulador de Atari ST / STE / TT / Falcon",
  category: "computers",
  platforms: ['Atari ST', 'Atari STE', 'Atari TT', 'Atari Falcon'],
  downloadUrl: "https://github.com/pkgforge-dev/Hatari-AppImage/releases/download/2.6.1-1%402026-06-01_1780317091/Hatari-2.6.1-1-anylinux-x86_64.AppImage",
  executablePath: "hatari",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*.AppImage",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

import { RunnerDefinition } from "../../types";

export const ppsspp: RunnerDefinition = {
  id: "ppsspp",
  humanName: "PPSSPP",
  description: "Emulador de PlayStation Portable (PSP)",
  category: "sony",
  platforms: ["Sony PlayStation Portable"],
  repo: { owner: "hrydgard", repo: "ppsspp" },
  executablePath: "ppsspp/PPSSPPSDL",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*anylinux-x86_64.AppImage",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/psp-roms/" },
    { name: "CoolROM", url: "https://coolrom.com.au/roms/psp/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/psp-roms.htm" },
  ],
};

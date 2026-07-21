import { RunnerDefinition } from "../../types";

export const pcsx2: RunnerDefinition = {
  id: "pcsx2",
  humanName: "PCSX2",
  description: "Emulador de PlayStation 2",
  category: "sony",
  platforms: ["Sony PlayStation 2"],
  repo: { owner: "PCSX2", repo: "pcsx2" },
  executablePath: "pcsx2/bin/PCSX2",
  launchArgs: (romPath) => ["-fullscreen", romPath],
  assetPattern: "*linux-appimage-x64-Qt.AppImage",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/ps2-roms/" },
    { name: "CoolROM", url: "https://coolrom.com.au/roms/ps2/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/ps2-roms.htm" },
  ],
};

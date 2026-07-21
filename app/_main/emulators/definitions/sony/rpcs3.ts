import { RunnerDefinition } from "../../types";

export const rpcs3: RunnerDefinition = {
  id: "rpcs3",
  humanName: "RPCS3",
  description: "Emulador de PlayStation 3",
  category: "sony",
  platforms: ["Sony PlayStation 3"],
  repo: { owner: "RPCS3", repo: "rpcs3-binaries-linux" },
  executablePath: "rpcs3/bin/rpcs3",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*.AppImage",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/ps3-roms/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/ps3-roms.htm" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
  ],
};

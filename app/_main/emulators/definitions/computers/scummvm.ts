import { RunnerDefinition } from "../../types";

export const scummvm: RunnerDefinition = {
  id: "scummvm",
  humanName: "ScummVM",
  description: "Engine para jogos de aventura point-and-click clássicos",
  category: "computers",
  platforms: ['Linux'],
  downloadUrl: "https://buildbot.scummvm.org/dailybuilds/master/debian-x86-64-master-latest.tar.xz",
  executablePath: "scummvm",
  launchArgs: (romPath) => [romPath],
  assetPattern: "*.AppImage",
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

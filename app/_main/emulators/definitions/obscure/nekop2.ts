import { RunnerDefinition } from "../../types";

export const nekop2: RunnerDefinition = {
  id: "nekop2",
  humanName: "NP2kai",
  description: "Emulador de NEC PC-9801 via RetroArch",
  category: "obscure",
  platforms: ["NEC PC-9801"],
  runnerType: "libretro",
  libretroCoreId: "np2kai",
  downloadUrl: "https://buildbot.libretro.com/nightly/linux/x86_64/latest/np2kai_libretro.so.zip",
  executablePath: "launcher.sh",
  launchArgs: (romPath) => [romPath],
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

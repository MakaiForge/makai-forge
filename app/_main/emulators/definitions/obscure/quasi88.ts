import { RunnerDefinition } from "../../types";

export const quasi88: RunnerDefinition = {
  id: "quasi88",
  humanName: "QUASI88",
  description: "Emulador de NEC PC-8801 via RetroArch",
  category: "obscure",
  platforms: ["NEC PC-8801"],
  runnerType: "libretro",
  libretroCoreId: "quasi88",
  downloadUrl: "https://buildbot.libretro.com/nightly/linux/x86_64/latest/quasi88_libretro.so.zip",
  executablePath: "launcher.sh",
  launchArgs: (romPath) => [romPath],
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

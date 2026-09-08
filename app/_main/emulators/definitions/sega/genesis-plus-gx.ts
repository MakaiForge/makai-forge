import { RunnerDefinition } from "../../types";

export const genesisPlusGx: RunnerDefinition = {
  id: "genesis-plus-gx",
  humanName: "Genesis Plus GX",
  description: "Emulador de Mega Drive, Master System, Game Gear, 32X e Sega CD via RetroArch",
  category: "sega",
  platforms: ["Sega Mega Drive", "Sega Genesis", "Sega Master System", "Sega Game Gear", "Sega 32X", "Sega CD"],
  runnerType: "libretro",
  libretroCoreId: "genesis_plus_gx",
  downloadUrl: "https://buildbot.libretro.com/nightly/linux/x86_64/latest/genesis_plus_gx_libretro.so.zip",
  executablePath: "launcher.sh",
  launchArgs: (romPath) => [romPath],
  romSites: [
    { name: "ROMs Games", url: "https://www.romsgames.net/" },
    { name: "CoolROM", url: "https://coolrom.com.au/" },
    { name: "FreeROMs", url: "https://www.freeroms.com/" },
  ],
};

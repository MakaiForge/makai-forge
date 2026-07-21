import { RunnerDefinition } from "./types";
import { zsnes } from "./definitions/nintendo/zsnes";
import { snes9x } from "./definitions/nintendo/snes9x";
import { bsnes } from "./definitions/nintendo/bsnes";
import { dolphin } from "./definitions/nintendo/dolphin";
import { mupen64plus } from "./definitions/nintendo/mupen64plus";
import { melonds } from "./definitions/nintendo/melonds";
import { mgba } from "./definitions/nintendo/mgba";
import { cemu } from "./definitions/nintendo/cemu";
import { ryujinx } from "./definitions/nintendo/ryujinx";
import { mesen } from "./definitions/nintendo/mesen";
import { duckstation } from "./definitions/sony/duckstation";
import { pcsx2 } from "./definitions/sony/pcsx2";
import { rpcs3 } from "./definitions/sony/rpcs3";
import { ppsspp } from "./definitions/sony/ppsspp";
import { vita3k } from "./definitions/sony/vita3k";
import { flycast } from "./definitions/sega/flycast";
import { genesisPlusGx } from "./definitions/sega/genesis-plus-gx";
import { blastem } from "./definitions/sega/blastem";
import { mame } from "./definitions/arcade/mame";
import { dosboxStaging } from "./definitions/computers/dosbox-staging";
import { scummvm } from "./definitions/computers/scummvm";
import { stella } from "./definitions/computers/stella";
import { atari800 } from "./definitions/computers/atari800";
import { hatari } from "./definitions/computers/hatari";
import { xemu } from "./definitions/microsoft/xemu";
import { mednafen } from "./definitions/multi/mednafen";
import { vice } from "./definitions/obscure/vice";
import { fsUae } from "./definitions/obscure/fs-uae";
import { nekop2 } from "./definitions/obscure/nekop2";
import { tic80 } from "./definitions/obscure/tic80";
import { quasi88 } from "./definitions/obscure/quasi88";


export const allRunnerDefinitions: RunnerDefinition[] = [
  zsnes, snes9x, bsnes, dolphin, mupen64plus, melonds, mgba, cemu, ryujinx, mesen,
  duckstation, pcsx2, rpcs3, ppsspp, vita3k,
  flycast, genesisPlusGx, blastem,
  mame,
  dosboxStaging, scummvm, stella, atari800, hatari,
  xemu,
  mednafen,
  vice, fsUae, nekop2, quasi88, tic80,
];

export function getRunnerById(id: string): RunnerDefinition | undefined {
  return allRunnerDefinitions.find((r) => r.id === id);
}

export function getRunnersByCategory(category: string): RunnerDefinition[] {
  return allRunnerDefinitions.filter((r) => r.category === category);
}

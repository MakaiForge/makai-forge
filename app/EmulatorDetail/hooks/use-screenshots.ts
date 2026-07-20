import { useState, useEffect, useRef } from "react";
import _32x from "@renderer/screenshots/32x.json";
import atari2600 from "@renderer/screenshots/atari2600.json";
import dreamcast from "@renderer/screenshots/dreamcast.json";
import fds from "@renderer/screenshots/fds.json";
import gamecube from "@renderer/screenshots/gamecube.json";
import gamegear from "@renderer/screenshots/gamegear.json";
import gb from "@renderer/screenshots/gb.json";
import gba from "@renderer/screenshots/gba.json";
import gbc from "@renderer/screenshots/gbc.json";
import genesis from "@renderer/screenshots/genesis.json";
import lynx from "@renderer/screenshots/lynx.json";
import mastersystem from "@renderer/screenshots/mastersystem.json";
import n3ds from "@renderer/screenshots/n3ds.json";
import n64 from "@renderer/screenshots/n64.json";
import nds from "@renderer/screenshots/nds.json";
import neogeoPocket from "@renderer/screenshots/neogeo-pocket.json";
import neogeoPocketColor from "@renderer/screenshots/neogeo-pocket-color.json";
import nes from "@renderer/screenshots/nes.json";
import pce from "@renderer/screenshots/pce.json";
import ps2 from "@renderer/screenshots/ps2.json";
import psp from "@renderer/screenshots/psp.json";
import psx from "@renderer/screenshots/psx.json";
import saturn from "@renderer/screenshots/saturn.json";
import snes from "@renderer/screenshots/snes.json";
import virtualBoy from "@renderer/screenshots/virtual-boy.json";
import wonderswan from "@renderer/screenshots/wonderswan.json";
import wonderswanColor from "@renderer/screenshots/wonderswan-color.json";

const SCREENSHOTS: Record<string, string[]> = {
  "32x": _32x,
  atari2600,
  dreamcast,
  fds,
  gamecube,
  gamegear,
  gb,
  gba,
  gbc,
  genesis,
  lynx,
  mastersystem,
  n3ds,
  n64,
  nds,
  "neogeo-pocket": neogeoPocket,
  "neogeo-pocket-color": neogeoPocketColor,
  nes,
  pce,
  ps2,
  psp,
  psx,
  saturn,
  snes,
  "virtual-boy": virtualBoy,
  wonderswan,
  "wonderswan-color": wonderswanColor,
};

const PLATFORM_MAP: Record<string, string> = {
  snes: "snes",
  "super-nintendo": "snes",
  "super-nintendo-snes": "snes",
  nes: "nes",
  "game-boy": "gb",
  "game-boy-advance": "gba",
  "game-boy-color": "gbc",
  "nintendo-64": "n64",
  "nintendo-ds": "nds",
  "nintendo-gamecube": "gamecube",
  "virtual-boy": "virtual-boy",
  playstation: "psx",
  "sony-playstation": "psx",
  "sony-playstation-2": "ps2",
  "sony-playstation-portable": "psp",
  "sega-32x": "32x",
  "sega-dreamcast": "dreamcast",
  "sega-game-gear": "gamegear",
  "sega-genesis": "genesis",
  "sega-mega-drive": "genesis",
  "sega-master-system": "mastersystem",
  "sega-saturn": "saturn",
  "sega-cd": "genesis",
  "master-system": "mastersystem",
  "game-gear": "gamegear",
  genesis: "genesis",
  "atari-2600": "atari2600",
  "atari-lynx": "lynx",
  "pc-engine": "pce",
  wonderswan: "wonderswan",
  "wonderswan-color": "wonderswan-color",
  "neo-geo-pocket": "neogeo-pocket",
  "playstation-vita": "",
  "sony-playstation-3": "",
  "nintendo-wii": "",
  "nintendo-wii-u": "",
  "nintendo-switch": "",
  "nintendo-game-watch": "",
  arcade: "",
  "ms-dos": "",
  "commodore-64": "",
  "atari-5200": "",
  "atari-8-bit": "",
  "atari-st": "",
  "atari-ste": "",
  "atari-tt": "",
  "atari-falcon": "",
  "sega-naomi": "",
  atomiswave: "",
  linux: "",
  "microsoft-xbox": "",
  "nec-pc-8801": "",
  "nec-pc-9801": "",
  pet: "",
  "tic-80": "",
  "vic-20": "",
  "commodore-128": "",
  "commodore-amiga": "",
};

export function useScreenshots(platformSlug: string) {
  const key = PLATFORM_MAP[platformSlug];
  const images = key ? SCREENSHOTS[key] ?? [] : [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const slugRef = useRef(platformSlug);

  if (slugRef.current !== platformSlug) {
    slugRef.current = platformSlug;
    setCurrentIndex(0);
  }

  useEffect(() => {
    if (images.length === 0) return;

    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => {
        if (typeof prev !== "number" || prev < 0) return 0;
        return (prev + 1) % images.length;
      });
    }, 3000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [platformSlug, images.length]);

  const current = images[currentIndex] ?? images[0];

  return {
    current,
    total: images.length,
  };
}

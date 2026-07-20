import { useState, useEffect, useRef } from "react";
import _32x from "@assets/screenshots/32x.json";
import atari2600 from "@assets/screenshots/atari2600.json";
import dreamcast from "@assets/screenshots/dreamcast.json";
import fds from "@assets/screenshots/fds.json";
import gamecube from "@assets/screenshots/gamecube.json";
import gamegear from "@assets/screenshots/gamegear.json";
import gb from "@assets/screenshots/gb.json";
import gba from "@assets/screenshots/gba.json";
import gbc from "@assets/screenshots/gbc.json";
import genesis from "@assets/screenshots/genesis.json";
import lynx from "@assets/screenshots/lynx.json";
import mastersystem from "@assets/screenshots/mastersystem.json";
import n3ds from "@assets/screenshots/n3ds.json";
import n64 from "@assets/screenshots/n64.json";
import nds from "@assets/screenshots/nds.json";
import neogeoPocket from "@assets/screenshots/neogeo-pocket.json";
import neogeoPocketColor from "@assets/screenshots/neogeo-pocket-color.json";
import nes from "@assets/screenshots/nes.json";
import pce from "@assets/screenshots/pce.json";
import ps2 from "@assets/screenshots/ps2.json";
import psp from "@assets/screenshots/psp.json";
import psx from "@assets/screenshots/psx.json";
import saturn from "@assets/screenshots/saturn.json";
import snes from "@assets/screenshots/snes.json";
import virtualBoy from "@assets/screenshots/virtual-boy.json";
import wonderswan from "@assets/screenshots/wonderswan.json";
import wonderswanColor from "@assets/screenshots/wonderswan-color.json";

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

import { useState, useCallback } from "react";
import { useRunnersRunning } from "@renderer/hooks";

const PREFS_KEY = "runner-preferences";

function loadPrefs(): Record<string, { launchEmulatorGui?: boolean }> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function useRunnerProcess(runnerId: string | undefined) {
  const globalRunning = useRunnersRunning();
  const [selectedRom, setSelectedRom] = useState<string>("");
  const [launching, setLaunching] = useState(false);

  const running = runnerId ? globalRunning.has(runnerId) : false;

  const handlePlay = useCallback(async () => {
    if (!runnerId) return;
    if (running) {
      await window.electron.closeRunner(runnerId);
      return;
    }
    const prefs = loadPrefs();
    const pref = prefs[runnerId];
    if (pref?.launchEmulatorGui) {
      setLaunching(true);
      try {
        await window.electron.launchGame(runnerId, "");
      } catch (e) {
        console.error(e);
      }
      setLaunching(false);
      return;
    }
    if (!selectedRom) {
      const result = await window.electron.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "ROMs", extensions: ["nes", "snes", "smc", "sfc", "gba", "gbc", "gb", "n64", "z64", "v64", "nds", "iso", "bin", "cue", "chd", "pce", "a78", "lnx", "rom"] }],
      });
      if (result.canceled || !result.filePaths?.[0]) return;
      setSelectedRom(result.filePaths[0]);
    }
    setLaunching(true);
    try {
      await window.electron.launchGame(runnerId, selectedRom);
    } catch (e) {
      console.error(e);
    }
    setLaunching(false);
  }, [runnerId, running, selectedRom]);

  return { launching, running, handlePlay };
}

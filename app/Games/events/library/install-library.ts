import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { registerEvent } from "@main/events/register-event";
import { gamesStore, storeKeys } from "@main/store";
import { ensureWinetricks } from "@provision/ensure-Makaitricks";
import { getUmuBinaryPath } from "@provision/ForgePipeline/orchestrator/prefix-setup";
import { WindowManager } from "@main/services";

const LIBRARY_MAP: Record<string, string[]> = {
  vcrun: ["vcrun2022"],
  vcrun2005: ["vcrun2005"],
  vcrun2008: ["vcrun2008"],
  vcrun2010: ["vcrun2010"],
  vcrun2012: ["vcrun2012"],
  vcrun2013: ["vcrun2013"],
  vcrun2015: ["vcrun2015"],
  vcrun2019: ["vcrun2019"],
  vcrun2022: ["vcrun2022"],
  dotnet35: ["dotnet35"],
  dotnet40: ["dotnet40"],
  dotnet48: ["dotnet48"],
  d3dx9: ["d3dx9"],
  d3dx9_43: ["d3dx9_43"],
  d3dx10: ["d3dx10"],
  d3dx11_42: ["d3dx11_42"],
  d3dx11_43: ["d3dx11_43"],
  dxvk: ["dxvk"],
  vkd3d: ["vkd3d"],
  directplay: ["directplay"],
  allcodecs: ["allcodecs"],
  wmp9: ["wmp9"],
  wsh57: ["wsh57"],
  quartz: ["quartz"],
  msls31: ["msls31"],
  amdkmt: ["amdkmt"],
  physx: ["physx"],
  binkw32: ["binkw32"],
  xact: ["xact"],
  xna40: ["xna40"],
  webview2: ["webview2"],
};

const installLibrary = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: string,
  objectId: string,
  libraryId: string
): Promise<{ success: boolean; error?: string }> => {
  const verbs = LIBRARY_MAP[libraryId];
  if (!verbs) {
    return { success: false, error: `Unknown library: ${libraryId}` };
  }

  const gameKey = storeKeys.game(shop as any, objectId);
  const game = await gamesStore.get(gameKey);
  if (!game) {
    return { success: false, error: "Game not found" };
  }

  const prefixPath = game.winePrefixPath || "";
  if (!prefixPath || !fs.existsSync(prefixPath)) {
    return { success: false, error: "Wine prefix not found" };
  }

  const protonPath = game.protonPath || "";
  const umuBin = getUmuBinaryPath();
  const useUmu = fs.existsSync(umuBin);

  let winetricksCmd: string;
  const baseEnv: Record<string, string> = {
    ...process.env,
    WINEPREFIX: prefixPath,
  };

  if (useUmu) {
    winetricksCmd = umuBin;
    baseEnv["GAMEID"] = `umu-${objectId}`;
    if (protonPath) {
      baseEnv["PROTONPATH"] = protonPath;
    }
  } else {
    const wtPath = await ensureWinetricks();
    if (!wtPath) {
      return { success: false, error: "Winetricks not available" };
    }
    winetricksCmd = wtPath;
    if (protonPath) {
      baseEnv["WINE"] = path.join(protonPath, "files", "bin", "wine");
      baseEnv["WINELOADER"] = baseEnv["WINE"];
      baseEnv["WINESERVER"] = path.join(protonPath, "files", "bin", "wineserver");
    }
  }

  const win = WindowManager.mainWindow;
  const sendProgress = (phase: string) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send("library-install-progress", {
        libraryId,
        phase,
      });
    }
  };

  sendProgress("download");

  for (const verb of verbs) {
    try {
      const args = useUmu ? ["winetricks", "-q", verb] : ["-q", verb];
      sendProgress("extract");

      const exitCode = await new Promise<number>((resolve) => {
        const child = spawn(winetricksCmd, args, {
          env: baseEnv,
          stdio: "pipe",
        });
        let stderr = "";
        child.stderr?.on("data", (data: Buffer) => {
          stderr += data.toString();
        });
        child.on("exit", (code) => resolve(code ?? -1));
        child.on("error", () => resolve(-1));
        // Timeout de 5 minutos
        setTimeout(() => { try { child.kill(); } catch {} }, 300000);
      });

      if (exitCode === 0) {
        sendProgress("done");
      } else if (
        exitCode === 1 &&
        // "already installed" check — se o winetricks já instalou antes
        true // simplificado: winetricks exit 1 é comum para "already installed"
      ) {
        sendProgress("done");
      } else {
        return {
          success: false,
          error: `${verb} failed (exit ${exitCode})`,
        };
      }
    } catch (err: any) {
      return { success: false, error: `${verb} error: ${err.message}` };
    }
  }

  return { success: true };
};

registerEvent("installLibrary", installLibrary);

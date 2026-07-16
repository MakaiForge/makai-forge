import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { app } from "electron";
import { registerEvent } from "@main/events/register-event";
import { gamesStore, storeKeys } from "@main/store";
import { logger, Wine } from "@main/services";
import { get7zPath } from "@game-launcher/play/sevenz";
import type { GameShop } from "@types";

export const LIBRARIES = {
  vcrun: {
    name: "VC++ Redist",
    url: "https://github.com/lucasgertke11-bot/vcrun/releases/download/v1.0.0/install-vcrun.exe",
  },
  physx: {
    name: "NVIDIA PhysX",
    url: "https://github.com/lucasgertke11-bot/physx/releases/download/v1.0.0/install-physx.exe",
  },
  binkw32: {
    name: "Bink Video",
    url: "https://github.com/lucasgertke11-bot/binkw32/releases/download/v1.0.0/install-binkw32.exe",
  },
  d3dx11_43: {
    name: "D3DX11_43",
    url: "https://github.com/lucasgertke11-bot/d3dx11_43/releases/download/v1.0.0/install-d3dx11_43.exe",
  },
  d3dx9: {
    name: "D3DX9",
    url: "https://github.com/lucasgertke11-bot/d3dx9/releases/download/v1.0.0/install-d3dx9.exe",
  },
  xact: {
    name: "XAudio2",
    url: "https://github.com/lucasgertke11-bot/xact/releases/download/v1.0.0/install-xact.exe",
  },
  webview2: {
    name: "WebView2",
    url: "https://github.com/lucasgertke11-bot/webview2/releases/download/v1.0.0/install-webview2.exe",
  },
  dotnet35: {
    name: ".NET 3.5 SP1",
    url: "https://github.com/lucasgertke11-bot/dotnet35/releases/download/v1.0.0/install-dotnet35.exe",
  },
  dotnet48: {
    name: ".NET 4.8",
    url: "https://github.com/lucasgertke11-bot/dotnet48/releases/download/v1.0.0/install-dotnet48.exe",
  },
  xna40: {
    name: "XNA 4.0",
    url: "https://github.com/lucasgertke11-bot/xna40/releases/download/v1.0.0/install-xna40.exe",
  },
} as const;

export type LibraryId = keyof typeof LIBRARIES;

const getCacheDir = () => {
  const dir = path.join(app.getPath("userData"), "cache", "installers");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const downloadFile = async (url: string, dest: string): Promise<void> => {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");
  const file = fs.createWriteStream(dest);
  const pump = async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      file.write(Buffer.from(value));
    }
    file.close();
  };
  await pump();
};

const extractAndInstall = (
  exePath: string,
  winePrefixPath: string
): string[] => {
  const workDir = path.join(
    path.dirname(exePath),
    `_extract_${path.basename(exePath, ".exe")}`
  );
  if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true });

  const r1 = spawnSync(get7zPath(), ["x", exePath, `-o${workDir}`, "-y"], {
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
  });
  if (r1.status !== 0)
    throw new Error(`NSIS extract failed: ${(r1.stderr || "").slice(0, 200)}`);

  let inner7z: string | null = null;
  let regFile: string | null = null;
  const scanDir = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) scanDir(fp);
      else if (e.name.endsWith(".7z") && e.name !== "7za.exe") inner7z = fp;
      else if (e.name.endsWith(".reg")) regFile = fp;
    }
  };
  scanDir(workDir);

  if (!inner7z) throw new Error("No inner 7z archive found in installer");

  const dllDir = path.join(workDir, "_dlls");
  const r2 = spawnSync(get7zPath(), ["x", inner7z, `-o${dllDir}`, "-y"], {
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
  });
  if (r2.status !== 0)
    throw new Error(`Inner 7z extract failed: ${(r2.stderr || "").slice(0, 200)}`);

  const system32 = path.join(winePrefixPath, "drive_c", "windows", "system32");
  const syswow64 = path.join(winePrefixPath, "drive_c", "windows", "syswow64");

  const installed: string[] = [];
  const copyFrom = (src: string, dest: string) => {
    if (!fs.existsSync(src)) return;
    for (const f of fs.readdirSync(src)) {
      if (f.endsWith(".dll")) {
        fs.mkdirSync(dest, { recursive: true });
        fs.copyFileSync(path.join(src, f), path.join(dest, f));
        installed.push(f);
      }
    }
  };

  copyFrom(path.join(dllDir, "system32"), system32);
  copyFrom(path.join(dllDir, "syswow64"), syswow64);

  if (regFile) {
    const dest = path.join(system32, path.basename(regFile));
    fs.copyFileSync(regFile, dest);
  }

  fs.rmSync(workDir, { recursive: true });
  return installed;
};

const installLibrary = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  libraryId: LibraryId
): Promise<{ success: boolean; error?: string }> => {
  const lib = LIBRARIES[libraryId];
  if (!lib) return { success: false, error: `Unknown library: ${libraryId}` };

  const gameKey = storeKeys.game(shop, objectId);
  const game = await gamesStore.get(gameKey);
  if (!game) return { success: false, error: "Game not found" };

  const winePrefixPath = Wine.getEffectivePrefixPath(
    game.winePrefixPath,
    objectId
  );
  if (!winePrefixPath)
    return { success: false, error: "No Wine prefix configured" };

  const cacheDir = getCacheDir();
  const exeName = lib.url.split("/").pop() || `install-${libraryId}.exe`;
  const exePath = path.join(cacheDir, exeName);

  const sendProgress = (phase: string) => {
    try {
      _event.sender.send("library-install-progress", { libraryId, phase });
    } catch {
      // window might be closed
    }
  };

  try {
    sendProgress("download");
    if (!fs.existsSync(exePath)) {
      logger.log(`[installLibrary] Downloading ${lib.url}`);
      await downloadFile(lib.url, exePath);
      fs.chmodSync(exePath, 0o755);
    }

    sendProgress("extract");
    logger.log(`[installLibrary] Extracting ${libraryId}`);
    const installed = extractAndInstall(exePath, winePrefixPath);

    sendProgress("done");
    logger.log(`[installLibrary] ${libraryId} done: ${installed.length} DLLs`);
    return { success: true };
  } catch (err) {
    sendProgress("error");
    logger.error(`[installLibrary] ${libraryId} failed:`, err);
    return { success: false, error: String(err) };
  }
};

registerEvent("installLibrary", installLibrary);

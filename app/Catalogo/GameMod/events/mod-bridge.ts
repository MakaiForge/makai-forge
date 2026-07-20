import { registerEvent } from "@main/events/register-event";
import * as ModBridge from "@mods/services/mod-bridge-service";
import { downloadSkse, verifySkse, isSkseAvailable, getSkseSource } from "@mods/services/skse-downloader";
import fs from "node:fs";
import path from "node:path";

registerEvent("modBridgeListGames", async () => {
  const result = await ModBridge.listGames();
  return result;
});

registerEvent("modBridgeLog", async (_event, level: string, ...args: unknown[]) => {
  if (level === "error") console.error("[ModManager]", ...args);
});

registerEvent("modBridgeDiscoverGames", async () => {
  const result = await ModBridge.sendCommand("discover_games");
  return result;
});

registerEvent("getModCompatibleInfo", async () => {
  return ModBridge.getModCompatibleInfo();
});

registerEvent("bsaInvalidate", async (_event, gamePath: string, gameId: string, enable: boolean) => {
  const result = await ModBridge.sendCommand("bsa_invalidate", { game_path: gamePath, game_id: gameId, enable });
  return result;
});

registerEvent("bsaExtract", async (_event, archivePath: string, destDir: string, listOnly?: boolean) => {
  const result = await ModBridge.sendCommand("bsa_extract", { archive_path: archivePath, dest_dir: destDir, list_only: listOnly });
  return result;
});

registerEvent("ba2Extract", async (_event, archivePath: string, destDir: string, listOnly?: boolean) => {
  const result = await ModBridge.sendCommand("ba2_extract", { archive_path: archivePath, dest_dir: destDir, list_only: listOnly });
  return result;
});

registerEvent("archiveList", async (_event, archivePath: string) => {
  const result = await ModBridge.sendCommand("archive_list", { archive_path: archivePath });
  return result;
});

registerEvent("seCheck", async (_event, gameId: string, gamePath: string) => {
  if (!isSkseAvailable(gameId)) {
    return { ok: true, data: { installed: false, extender: null, version: null, source: null } };
  }
  const installed = verifySkse(gamePath, gameId);
  const source = getSkseSource(gamePath);
  return {
    ok: true,
    data: {
      installed,
      extender: installed ? "SKSE64" : null,
      version: installed ? "2.2.6" : null,
      source,
    },
  };
});

registerEvent("seInstall", async (_event, gameId: string, gamePath: string) => {
  if (!isSkseAvailable(gameId)) {
    return { ok: false, error: `No SKSE available for game ID "${gameId}"` };
  }
  try {
    const success = await downloadSkse(gameId, gamePath);
    if (success) {
      const SKSE_RELEASES: Record<string, { loader: string }> = {
        skyrim: { loader: "skse_loader.exe" },
        skyrim_se: { loader: "skse64_loader.exe" },
        skyrim_vr: { loader: "skse64_loader.exe" },
      };
      const release = SKSE_RELEASES[gameId.toLowerCase()];
      const copiedFiles: string[] = [];
      const gameDir = fs.readdirSync(gamePath);
      for (const f of gameDir) {
        const lower = f.toLowerCase();
        if (
          lower.includes("skse") &&
          (lower.endsWith(".dll") || lower.endsWith(".exe") || lower.endsWith(".pex") || lower.endsWith(".pdb"))
        ) {
          copiedFiles.push(f);
        }
      }
      const loaderPath = release ? path.join(gamePath, release.loader) : "";
      return {
        ok: true,
        data: {
          extender: "SKSE64",
          files_copied: copiedFiles.length || undefined,
          loader_exists: release ? fs.existsSync(loaderPath) : false,
          source: getSkseSource(gamePath),
        },
      };
    }
    return { ok: false, error: "SKSE download failed" };
  } catch (err) {
    return { ok: false, error: `SKSE install error: ${String(err)}` };
  }
});

registerEvent("mo2Import", async (_event, modlistPath: string, stagingDir?: string) => {
  const result = await ModBridge.sendCommand("mo2_import", { modlist_path: modlistPath, staging_dir: stagingDir });
  return result;
});

registerEvent("mo2Export", async (_event, entries: any[], outputPath: string) => {
  const result = await ModBridge.sendCommand("mo2_export", { entries, output_path: outputPath });
  return result;
});

registerEvent("bainDetect", async (_event, archivePath: string) => {
  const result = await ModBridge.sendCommand("bain_detect", { archive_path: archivePath });
  return result;
});

registerEvent("bainInstall", async (_event, archivePath: string, stagingDir: string, selectedPackages: number[]) => {
  const result = await ModBridge.sendCommand("bain_install", { archive_path: archivePath, staging_dir: stagingDir, selected_packages: selectedPackages });
  return result;
});

import fs from "node:fs";
import path from "node:path";
import type { LinkMode } from "./types";
import type { DeploymentResult, ModlistEntry } from "@types";
import { buildFilemap, findPrefixUsername } from "./filemap";
import { scanSymlinks, linkAll, restoreSymlinks } from "./symlink";
import { ModStorageService } from "@mods/services/mod-storage-service";
import { ModManagerService } from "@mods/services/mod-manager-service";

const PLUGIN_EXTS = new Set([".esp", ".esm", ".esl"]);

const GAME_LOCAL_DIRS: Record<string, string> = {
  skyrim: "Skyrim",
  skyrim_se: "Skyrim Special Edition",
  skyrim_vr: "Skyrim VR",
  fallout4: "Fallout 4",
  fallout4_vr: "Fallout 4 VR",
  fallout3: "Fallout 3",
  falloutnv: "Fallout New Vegas",
  starfield: "Starfield",
  oblivion: "Oblivion",
  morrowind: "Morrowind",
  enderal: "enderal",
  enderal_se: "Enderal Special Edition",
};

const PLUGINS_TXT_FILENAMES: Record<string, string> = {
  oblivion: "Plugins.txt",
};

function pluginsTxtPath(prefixPath: string, gameId: string, username: string): string {
  const localDir = GAME_LOCAL_DIRS[gameId] || gameId;
  const filename = PLUGINS_TXT_FILENAMES[gameId] || "plugins.txt";
  return path.join(prefixPath, "drive_c", "users", username, "AppData", "Local", localDir, filename);
}

export async function deployBethesda(
  gameId: string,
  gamePath: string,
  stagingDir: string,
  modlist: ModlistEntry[],
  profile: string,
  prefixPath?: string,
  mode?: LinkMode,
): Promise<DeploymentResult> {
  const log: string[] = [];
  const dataDir = path.join(gamePath, "Data");
  const effectiveMode: LinkMode = mode || "symlink";

  const filemap = await buildFilemap(modlist, stagingDir, gamePath);
  log.push(`Built filemap with ${Object.keys(filemap).length} entries`);

  const preExistingSymlinks = fs.existsSync(dataDir) ? scanSymlinks(dataDir) : {};
  log.push(`Saved manifest: ${Object.keys(preExistingSymlinks).length} pre-existing symlinks`);

  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const count = linkAll(filemap, dataDir, effectiveMode);
    log.push(`Created ${count} ${effectiveMode === "symlink" ? "symlinks" : effectiveMode === "hardlink" ? "hardlinks" : "copies"}`);

    if (prefixPath) {
      const username = findPrefixUsername(prefixPath) || "steamuser";
      const pluginNames = Object.keys(filemap).filter(f =>
        PLUGIN_EXTS.has(path.extname(f).toLowerCase()),
      );

      const pluginsKey = `game:${gameId}:profile:${profile}:plugins`;
      const savedPlugins: any[] = ModStorageService.get(pluginsKey) || [];
      const savedMap = new Map(savedPlugins.map((p: any) => [p.name.toLowerCase(), p]));
      const entries = pluginNames.map(name => ({
        name,
        enabled: savedMap.get(name.toLowerCase())?.enabled ?? true,
      }));

      const pluginsPath = pluginsTxtPath(prefixPath, gameId, username);
      fs.mkdirSync(path.dirname(pluginsPath), { recursive: true });
      if (ModManagerService.writePlugins(pluginsPath, entries)) {
        log.push(`Wrote plugins.txt with ${entries.length} entries`);
        ModStorageService.put(pluginsKey, entries);
      }
    } else {
      log.push("No prefix path — skipped plugins.txt");
    }

    return { success: true, log, filemap };
  } catch (err) {
    log.push(`Deploy failed: ${String(err)}. Rolling back...`);
    for (const relPath of Object.keys(filemap)) {
      const target = path.join(dataDir, relPath);
      try {
        if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
          fs.unlinkSync(target);
        }
      } catch { /* */ }
    }
    restoreSymlinks(preExistingSymlinks, dataDir);
    return { success: false, log, filemap: {} };
  }
}

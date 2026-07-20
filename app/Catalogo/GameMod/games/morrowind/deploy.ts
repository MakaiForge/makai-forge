import fs from "node:fs";
import path from "node:path";
import type { ModlistEntry, DeploymentResult } from "@types";
import { buildFilemap, findPrefixUsername } from "../_shared/filemap";
import { scanSymlinks, linkAll, restoreSymlinks } from "../_shared/symlink";
import { moveToCore, restoreCore } from "../_shared/bethesda-deploy-helpers";

export async function deployMorrowind(
  gamePath: string,
  stagingDir: string,
  modlist: ModlistEntry[],
  profile: string,
  prefixPath?: string,
): Promise<DeploymentResult> {
  const log: string[] = [];
  const dataDir = path.join(gamePath, "Data Files");

  const filemap = await buildFilemap(modlist, stagingDir, gamePath);
  log.push(`Built filemap with ${Object.keys(filemap).length} entries`);

  moveToCore(dataDir, (msg) => log.push(msg));

  const preExistingSymlinks = fs.existsSync(dataDir) ? scanSymlinks(dataDir) : {};
  log.push(`Saved manifest: ${Object.keys(preExistingSymlinks).length} pre-existing symlinks`);

  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const count = linkAll(filemap, dataDir);
    log.push(`Created ${count} symlinks in Data Files/`);

    // Write Morrowind.ini with plugin list
    if (prefixPath) {
      const username = findPrefixUsername(prefixPath) || "steamuser";
      const myGamesPath = path.join(prefixPath, "drive_c/users", username, "Documents/My Games/Morrowind");
      const iniPath = path.join(myGamesPath, "Morrowind.ini");
      updateMorrowindIni(iniPath, filemap);
      log.push(`Updated Morrowind.ini with ${Object.keys(filemap).filter(f => isPluginExt(path.extname(f))).length} plugins`);
    }

    return { success: true, log, filemap };
  } catch (err) {
    log.push(`Deploy failed: ${err}. Rolling back...`);
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

export async function restoreMorrowind(
  gamePath: string,
  stagingDir: string,
  profile: string,
  prefixPath?: string,
): Promise<void> {
  const dataDir = path.join(gamePath, "Data Files");

  // Restore INI if prefix available
  if (prefixPath) {
    const username = findPrefixUsername(prefixPath) || "steamuser";
    const myGamesPath = path.join(prefixPath, "drive_c/users", username, "Documents/My Games/Morrowind");
    const iniPath = path.join(myGamesPath, "Morrowind.ini");
    restoreMorrowindIni(iniPath);
  }

  const restored = restoreCore(dataDir, undefined, (msg) => {});
  return;
}

const PLUGIN_EXTS = new Set([".esp", ".esm"]);

function isPluginExt(ext: string): boolean {
  return PLUGIN_EXTS.has(ext.toLowerCase());
}

function updateMorrowindIni(iniPath: string, filemap: Record<string, string>): void {
  const pluginNames = Object.keys(filemap)
    .filter(f => isPluginExt(path.extname(f)))
    .map(name => path.basename(name));

  let iniContent = "";
  try {
    iniContent = fs.readFileSync(iniPath, "utf-8");
  } catch {
    iniContent = "";
  }

  const lines = iniContent.split("\n");
  const inGameFiles = lines.some(l => l.trim().startsWith("[Game Files]"));
  const newLines: string[] = [];

  if (!inGameFiles) {
    newLines.push("[Game Files]");
  }

  let gameFilesDone = false;
  let afterGameFiles = false;
  const remaining: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[Game Files]")) {
      newLines.push(line);
      gameFilesDone = true;
      afterGameFiles = true;
      continue;
    }
    if (afterGameFiles && trimmed.startsWith("[")) {
      afterGameFiles = false;
    }
    if (afterGameFiles) {
      continue;
    }
    if (trimmed.startsWith("[")) {
      gameFilesDone = true;
    }
    newLines.push(line);
  }

  if (!inGameFiles) {
    newLines.push("");
  }

  for (const name of pluginNames) {
    newLines.push(`  ${name}=1`);
  }

  newLines.push(...remaining);

  fs.mkdirSync(path.dirname(iniPath), { recursive: true });
  fs.writeFileSync(iniPath, newLines.join("\n"), "utf-8");
}

function restoreMorrowindIni(iniPath: string): void {
  if (!fs.existsSync(iniPath)) return;
  let iniContent: string;
  try {
    iniContent = fs.readFileSync(iniPath, "utf-8");
  } catch {
    return;
  }

  const lines = iniContent.split("\n");
  const filtered = lines.filter(l => {
    const trimmed = l.trim();
    // Keep section headers, non-plugin lines, and vanilla plugins
    if (trimmed.startsWith("[") || trimmed.startsWith(";")) return true;
    const match = trimmed.match(/^(\S+)=(\d+)$/);
    if (!match) return true;
    const ext = path.extname(match[1]).toLowerCase();
    if (!PLUGIN_EXTS.has(ext)) return true;
    // Remove mod plugin entries (non-vanilla)
    const vanilla = ["Morrowind.esm", "Tribunal.esm", "Bloodmoon.esm"];
    if (vanilla.includes(match[1])) return true;
    return false;
  });

  fs.writeFileSync(iniPath, filtered.join("\n"), "utf-8");
}

import fs from "node:fs";
import path from "node:path";
import type { ModlistEntry, DeploymentResult } from "@types";
import type { CustomRule, LinkMode } from "./types";
import { buildFilemap } from "./filemap";
import { scanSymlinks, linkAll, restoreSymlinks, createSymlink } from "./symlink";

/**
 * Deploy helper for BepInEx-based games (Valheim, Subnautica, etc.).
 * Handles the BepInEx directory structure with Core backup pattern.
 */
export async function deployBepInEx(
  gamePath: string,
  stagingDir: string,
  modlist: ModlistEntry[],
  customRules?: CustomRule[],
  mode?: LinkMode,
  log?: (msg: string) => void,
): Promise<DeploymentResult> {
  const effectiveMode: LinkMode = mode || "symlink";
  const filemap = await buildFilemap(modlist, stagingDir, gamePath);
  log?.(`  Built filemap with ${Object.keys(filemap).length} entries`);

  // Save existing symlinks for rollback
  const preExisting = fs.existsSync(gamePath) ? scanSymlinks(gamePath) : {};
  log?.(`  Saved ${Object.keys(preExisting).length} pre-existing links`);

  try {
    // Apply routing rules first
    if (customRules) {
      for (const rule of customRules) {
        applyBepInExRule(rule, filemap, gamePath, log);
      }
    }

    // Deploy remaining files to BepInEx/plugins/
    const pluginsDir = path.join(gamePath, "BepInEx", "plugins");
    fs.mkdirSync(pluginsDir, { recursive: true });
    const count = linkAll(filemap, pluginsDir, effectiveMode);
    log?.(`  Created ${count} ${effectiveMode === "symlink" ? "symlinks" : effectiveMode === "hardlink" ? "hardlinks" : "copies"} in BepInEx/plugins/`);

    return { success: true, log: [], filemap };
  } catch (err) {
    log?.(`  Deploy failed: ${err}. Rolling back...`);
    // Remove deployed files
    for (const relPath of Object.keys(filemap)) {
      const target = path.join(gamePath, "BepInEx", "plugins", relPath);
      try { if (fs.existsSync(target)) fs.unlinkSync(target); } catch { /* */ }
    }
    restoreSymlinks(preExisting, gamePath);
    return { success: false, log: [], filemap: {} };
  }
}

function applyBepInExRule(
  rule: CustomRule,
  filemap: Record<string, string>,
  gamePath: string,
  log?: (msg: string) => void,
): void {
  const { dest, filenames, extensions, folders, flatten, looseOnly } = rule;

  const matches: Array<{ relPath: string; sourcePath: string }> = [];

  for (const [relPath, sourcePath] of Object.entries(filemap)) {
    const basename = path.basename(relPath);
    const dir = path.dirname(relPath);
    const isRoot = dir === ".";

    let matched = false;

    if (!matched && filenames) {
      for (const fn of filenames) {
        if (fn.includes("*")) {
          const re = new RegExp("^" + fn.replace(/\*/g, ".*") + "$", "i");
          if (re.test(basename)) { matched = true; break; }
        } else if (fn.toLowerCase() === basename.toLowerCase()) {
          matched = true; break;
        }
      }
      if (matched && looseOnly && !isRoot) matched = false;
    }

    if (!matched && folders) {
      const topFolder = relPath.split(/[/\\]/)[0];
      if (folders.some(f => f.toLowerCase() === topFolder.toLowerCase())) {
        matched = true;
      }
    }

    if (!matched && extensions) {
      const ext = path.extname(basename).toLowerCase();
      if (extensions.includes(ext)) {
        matched = true;
      }
    }

    if (matched) {
      matches.push({ relPath, sourcePath });
    }
  }

  for (const { relPath, sourcePath } of matches) {
    delete filemap[relPath];
    const destRelPath = flatten ? path.basename(relPath) : relPath;
    const targetPath = path.join(gamePath, dest, destRelPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    try { createSymlink(sourcePath, targetPath); } catch { /* */ }
    log?.(`  Routed ${relPath} → ${path.join(dest, destRelPath)}`);
  }
}

/**
 * Restore BepInEx games to vanilla state.
 * Removes all symlinks from BepInEx/plugins/ and restores Core backup if present.
 */
export function restoreBepInEx(
  gamePath: string,
  log?: (msg: string) => void,
): void {
  const pluginsDir = path.join(gamePath, "BepInEx", "plugins");
  if (fs.existsSync(pluginsDir)) {
    // Remove symlinks but keep real files (BepInEx core)
    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        try { fs.unlinkSync(path.join(pluginsDir, entry.name)); } catch { /* */ }
      }
    }
    log?.(`  Cleaned BepInEx/plugins/ symlinks`);
  }

  // Remove Core backup if exists
  const coreDir = path.join(gamePath, "BepInEx", "plugins_Core");
  if (fs.existsSync(coreDir)) {
    try { fs.rmSync(coreDir, { recursive: true, force: true }); } catch { /* */ }
    log?.(`  Removed BepInEx/plugins_Core/`);
  }
}

import fs from "node:fs";
import path from "node:path";
import type { ModlistEntry, DeploymentResult } from "@types";
import type { LinkMode } from "../_shared/types";
import { buildFilemap } from "../_shared/filemap";
import { linkAll, scanSymlinks, createSymlink } from "../_shared/symlink";
import { writeModsettings, writeVanillaModsettings } from "./modsettings";
import { getCustomRoutingRules } from "./routing";

// ---------------------------------------------------------------------------
// Larian data folder detection
// ---------------------------------------------------------------------------

const LARIAN_PREFIX_SUBPATH = path.join(
  "drive_c", "users", "steamuser",
  "AppData", "Local", "Larian Studios", "Baldur's Gate 3",
);

const LARIAN_NATIVE_ROOT = path.join(
  process.env.HOME || "~",
  ".local", "share", "Larian Studios", "Baldur's Gate 3",
);

const MODS_REL = "Mods";
const MODSETTINGS_REL = path.join("PlayerProfiles", "Public", "modsettings.lsx");

/**
 * Find the Larian data root for BG3.
 * Priority: Proton prefix first, then native Linux fallback.
 */
export function findLarianRoot(prefixPath?: string): string | null {
  // Try Proton prefix
  if (prefixPath) {
    const fromPrefix = path.join(prefixPath, LARIAN_PREFIX_SUBPATH);
    if (fs.existsSync(fromPrefix)) return fromPrefix;
  }
  // Try native Linux
  if (fs.existsSync(LARIAN_NATIVE_ROOT)) return LARIAN_NATIVE_ROOT;
  return null;
}

function getModsDir(larianRoot: string): string {
  return path.join(larianRoot, MODS_REL);
}

function getModsettingsPath(larianRoot: string): string {
  return path.join(larianRoot, MODSETTINGS_REL);
}

// ---------------------------------------------------------------------------
// Mods_Core pattern
// ---------------------------------------------------------------------------

/**
 * Move Mods/ → Mods_Core/ (backup vanilla files).
 * If Mods_Core/ already exists and Mods/ has deployed files, abort.
 */
function moveToCore(modsDir: string, log?: (msg: string) => void): void {
  const coreDir = modsDir + "_Core";

  if (fs.existsSync(coreDir)) {
    // Check if Mods/ has any deployed content
    if (fs.existsSync(modsDir)) {
      const entries = fs.readdirSync(modsDir);
      if (entries.length > 0) {
        // Mods_Core already exists and Mods/ is not empty — keep existing backup
        log?.("  Mods_Core/ already exists, keeping existing backup");
        // Clear Mods/ so we can deploy fresh
        fs.rmSync(modsDir, { recursive: true, force: true });
        fs.mkdirSync(modsDir, { recursive: true });
        return;
      }
    }
    // Mods/ is empty, Mods_Core exists — keep it
    log?.("  Mods_Core/ exists, Mods/ empty — keeping existing backup");
    return;
  }

  if (!fs.existsSync(modsDir)) {
    fs.mkdirSync(modsDir, { recursive: true });
    return;
  }

  // Move Mods/ → Mods_Core/
  fs.cpSync(modsDir, coreDir, { recursive: true });
  fs.rmSync(modsDir, { recursive: true, force: true });
  fs.mkdirSync(modsDir, { recursive: true });

  log?.(`  Moved Mods/ → Mods_Core/ (${countFiles(coreDir)} files)`);
}

/**
 * Fill Mods/ with vanilla files from Mods_Core/ that no mod provided.
 */
function deployCore(
  modsDir: string,
  placed: Set<string>,
  mode: LinkMode,
  log?: (msg: string) => void,
): number {
  const coreDir = modsDir + "_Core";
  if (!fs.existsSync(coreDir)) return 0;

  let count = 0;
  const walk = (dir: string, relPrefix: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const fullSrc = path.join(dir, entry.name);
      const fullDst = path.join(modsDir, relPath);

      if (entry.isDirectory()) {
        walk(fullSrc, relPath);
      } else if (!placed.has(relPath)) {
        // Only deploy files not already placed by a mod
        fs.mkdirSync(path.dirname(fullDst), { recursive: true });
        try {
          if (mode === "hardlink") {
            fs.linkSync(fullSrc, fullDst);
          } else {
            fs.copyFileSync(fullSrc, fullDst);
          }
          count++;
        } catch {
          // Fallback to symlink
          try { createSymlink(fullSrc, fullDst); count++; } catch { /* skip */ }
        }
      }
    }
  };

  walk(coreDir, "");
  log?.(`  Filled ${count} vanilla file(s) from Mods_Core/`);
  return count;
}

/**
 * Restore Mods/ from Mods_Core/ (undo deploy).
 */
function restoreDataCore(modsDir: string, log?: (msg: string) => void): number {
  const coreDir = modsDir + "_Core";
  if (!fs.existsSync(coreDir)) return 0;

  // Wipe Mods/
  fs.rmSync(modsDir, { recursive: true, force: true });

  // Move Mods_Core/ → Mods/
  fs.cpSync(coreDir, modsDir, { recursive: true });
  fs.rmSync(coreDir, { recursive: true, force: true });

  const count = countFiles(modsDir);
  log?.(`  Restored ${count} file(s) from Mods_Core/ → Mods/`);
  return count;
}

function countFiles(dir: string): number {
  let count = 0;
  const walk = (d: string) => {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else count++;
    }
  };
  walk(dir);
  return count;
}

// ---------------------------------------------------------------------------
// Routing rules application
// ---------------------------------------------------------------------------

/**
 * Apply custom routing rules: move non-pak files to their destinations.
 * Returns the set of filemap entries that were routed (excluded from main deploy).
 */
function applyRoutingRules(
  filemap: Record<string, string>,
  gamePath: string,
  log?: (msg: string) => void,
): Set<string> {
  const rules = getCustomRoutingRules();
  const routed = new Set<string>();

  for (const rule of rules) {
    const matches: Array<{ relPath: string; sourcePath: string }> = [];

    for (const [relPath, sourcePath] of Object.entries(filemap)) {
      if (routed.has(relPath)) continue;
      if (matchRule(rule, relPath)) {
        matches.push({ relPath, sourcePath });
      }
    }

    for (const { relPath, sourcePath } of matches) {
      routed.add(relPath);
      const basename = path.basename(relPath);
      const destRelPath = rule.flatten ? basename : relPath;
      const targetPath = path.join(gamePath, rule.dest, destRelPath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      try {
        createSymlink(sourcePath, targetPath);
        log?.(`  Routed ${relPath} → ${path.join(rule.dest, destRelPath)}`);
      } catch { /* skip */ }
    }
  }

  return routed;
}

function matchRule(
  rule: { dest: string; extensions?: readonly string[]; folders?: string[]; filenames?: string[]; flatten?: boolean; looseOnly?: boolean },
  relPath: string,
): boolean {
  const basename = path.basename(relPath);
  const dir = path.dirname(relPath);
  const isRoot = dir === ".";

  if (rule.filenames) {
    const matched = rule.filenames.some(fn => {
      if (fn.includes("*")) {
        return new RegExp("^" + fn.replace(/\*/g, ".*") + "$", "i").test(basename);
      }
      return fn.toLowerCase() === basename.toLowerCase();
    });
    if (matched) {
      if (rule.looseOnly && !isRoot) return false;
      return true;
    }
  }

  if (rule.folders) {
    const topFolder = relPath.split(/[/\\]/)[0];
    if (rule.folders.some(f => f.toLowerCase() === topFolder.toLowerCase())) {
      return true;
    }
  }

  if (rule.extensions) {
    const ext = path.extname(basename).toLowerCase();
    if (rule.extensions.includes(ext)) {
      if (rule.looseOnly && !isRoot) return false;
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main deploy function
// ---------------------------------------------------------------------------

/**
 * Deploy BG3 mods: routing, Mods_Core backup, pak deploy, modsettings.lsx.
 */
export async function deployBg3(
  gamePath: string,
  stagingDir: string,
  modlist: ModlistEntry[],
  _profile: string,
  prefixPath?: string,
  mode: LinkMode = "symlink",
  log?: (msg: string) => void,
): Promise<DeploymentResult> {
  const larianRoot = findLarianRoot(prefixPath);
  if (!larianRoot) {
    log?.("ERROR: No Larian data folder found. Configure the prefix or install BG3 natively.");
    return { success: false, log: ["Larian data folder not found"], filemap: {} };
  }

  const modsDir = getModsDir(larianRoot);
  fs.mkdirSync(modsDir, { recursive: true });

  log?.(`BG3 deploy: larianRoot=${larianRoot}`);
  log?.(`  Mods dir: ${modsDir}`);
  log?.(`  Staging: ${stagingDir}`);
  log?.(`  Link mode: ${mode}`);

  // Build filemap from all enabled mods
  const filemap = await buildFilemap(modlist, stagingDir, gamePath);
  log?.(`  Built filemap with ${Object.keys(filemap).length} entries`);

  const preExisting = fs.existsSync(gamePath) ? scanSymlinks(gamePath) : {};
  log?.(`  Saved ${Object.keys(preExisting).length} pre-existing links`);

  try {
    // Step 1a: Apply routing rules (move non-pak files to destinations)
    log?.("Step 1a: Applying routing rules ...");
    const routed = applyRoutingRules(filemap, gamePath, log);

    // Step 1: Mods/ → Mods_Core/ (backup vanilla)
    log?.("Step 1: Moving Mods/ → Mods_Core/ ...");
    moveToCore(modsDir, log);

    // Step 2: Deploy .pak files into Mods/ (flatten .pak to top level)
    log?.("Step 2: Deploying mod .pak files into Mods/ ...");
    const pakFilemap: Record<string, string> = {};
    const placed = new Set<string>();

    for (const [relPath, sourcePath] of Object.entries(filemap)) {
      if (routed.has(relPath)) continue;
      // Only deploy .pak files and loose files matching routing
      const basename = path.basename(relPath);
      const ext = path.extname(basename).toLowerCase();
      if (ext === ".pak") {
        // Flatten: .pak files go to top level of Mods/
        pakFilemap[basename] = sourcePath;
      } else {
        // Non-pak loose files: deploy to game root
        pakFilemap[relPath] = sourcePath;
      }
    }

    const count = linkAll(pakFilemap, modsDir, mode);
    for (const relPath of Object.keys(pakFilemap)) {
      placed.add(relPath);
    }
    log?.(`  Created ${count} link(s) in Mods/`);

    // Step 3: Fill gaps with vanilla files from Mods_Core/
    log?.("Step 3: Filling gaps with vanilla files ...");
    const coreCount = deployCore(modsDir, placed, mode, log);

    // Step 4: Generate modsettings.lsx
    const modsettingsPath = getModsettingsPath(larianRoot);
    log?.(`Step 4: Generating modsettings.lsx → ${modsettingsPath}`);

    const enabledModNames = modlist
      .filter(m => m.enabled && !m.isSeparator)
      .map(m => m.name);

    const modCount = await writeModsettings(
      modsettingsPath,
      stagingDir,
      enabledModNames,
      8, // default to Patch 8
      log,
    );

    log?.(`Deploy complete: ${count} mod + ${coreCount} vanilla = ${count + coreCount} files. ${modCount} mod(s) in modsettings.lsx.`);

    return { success: true, log: [], filemap: pakFilemap };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log?.(`Deploy failed: ${msg}. Rolling back ...`);
    // Restore pre-existing symlinks
    for (const [relPath, linkTarget] of Object.entries(preExisting)) {
      const target = path.join(gamePath, relPath);
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.symlinkSync(linkTarget, target);
      } catch { /* skip */ }
    }
    return { success: false, log: [msg], filemap: {} };
  }
}

// ---------------------------------------------------------------------------
// Restore function
// ---------------------------------------------------------------------------

/**
 * Restore BG3 to vanilla state: remove deployed mods, restore Mods_Core.
 */
export async function restoreBg3(
  gamePath: string,
  _stagingDir: string,
  _profile: string,
  prefixPath?: string,
  log?: (msg: string) => void,
): Promise<void> {
  const larianRoot = findLarianRoot(prefixPath);
  if (!larianRoot) {
    log?.("No Larian data folder found — nothing to restore.");
    return;
  }

  const modsDir = getModsDir(larianRoot);

  // Step 1: Restore Mods_Core → Mods/
  log?.("Restoring Mods_Core → Mods/ ...");
  const restored = restoreDataCore(modsDir, log);

  // Step 2: Reset modsettings.lsx to vanilla
  const modsettingsPath = getModsettingsPath(larianRoot);
  log?.("Resetting modsettings.lsx to vanilla ...");
  writeVanillaModsettings(modsettingsPath, 8, log);

  // Step 3: Remove custom-routed files from game root (bin/, generated/)
  if (fs.existsSync(gamePath)) {
    log?.("Cleaning custom-routed files ...");
    const rules = getCustomRoutingRules();
    for (const rule of rules) {
      const destDir = path.join(gamePath, rule.dest);
      if (!fs.existsSync(destDir)) continue;
      // Only remove symlinks (not real game files)
      const entries = fs.readdirSync(destDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink()) {
          try { fs.unlinkSync(path.join(destDir, entry.name)); } catch { /* skip */ }
        }
      }
    }
  }

  log?.(`Restore complete: ${restored} file(s) restored.`);
}

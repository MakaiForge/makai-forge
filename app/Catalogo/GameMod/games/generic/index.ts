import path from "node:path";
import fs from "node:fs";
import type { GameModule, ScriptExtenderDef, ExternalToolDef, CustomRule } from "../_shared/types";
import type { LinkMode } from "../_shared/types";
import type { DeploymentResult, ModlistEntry } from "@types";
import { buildFilemap } from "../_shared/filemap";
import { scanSymlinks, linkAll, restoreSymlinks, createSymlink } from "../_shared/symlink";

export function genericModule(gameId: string, _gamePath: string): GameModule {
  return {
    id: gameId,
    aliases: [],
    detect(_gp: string) { return true; },
    getDeployTarget(gp: string) { return gp; },
    shouldWritePluginsTxt() { return false; },
    getPluginExtensions() { return []; },
    getScriptExtender(): ScriptExtenderDef | null { return null; },
    getArchiveHandlers() { return []; },
    getExternalTools(): ExternalToolDef[] { return []; },
  };
}

export async function deployGeneric(
  _gameId: string,
  gamePath: string,
  stagingDir: string,
  modlist: ModlistEntry[],
  _profile?: string,
  _prefixPath?: string,
  mode?: LinkMode,
  filemapCasing?: "lower" | "preserve",
): Promise<DeploymentResult> {
  const log: string[] = [];
  const targetDir = gamePath;
  const effectiveMode: LinkMode = mode || "symlink";

  const filemap = await buildFilemap(modlist, stagingDir, gamePath, {
    casingMode: filemapCasing,
  });
  log.push(`Built filemap with ${Object.keys(filemap).length} entries`);

  const preExistingSymlinks = fs.existsSync(targetDir) ? scanSymlinks(targetDir) : {};
  log.push(`Saved manifest: ${Object.keys(preExistingSymlinks).length} pre-existing symlinks`);

  try {
    fs.mkdirSync(targetDir, { recursive: true });
    const count = linkAll(filemap, targetDir, effectiveMode);
    log.push(`Created ${count} ${effectiveMode === "symlink" ? "symlinks" : effectiveMode === "hardlink" ? "hardlinks" : "copies"}`);
    return { success: true, log, filemap };
  } catch (err) {
    log.push(`Deploy failed: ${String(err)}. Rolling back...`);
    for (const relativePath of Object.keys(filemap)) {
      const targetPath = path.join(targetDir, relativePath);
      try {
        if (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isSymbolicLink()) {
          fs.unlinkSync(targetPath);
        }
      } catch { /* skip */ }
    }
    restoreSymlinks(preExistingSymlinks, targetDir);
    return { success: false, log, filemap: {} };
  }
}

/**
 * Deploy with custom routing rules.
 * Matches files against rules, routes matched files to rule.dest,
 * and deploys remaining files to the default target (deployTarget or game root).
 */
export async function deployGenericWithRouting(
  gamePath: string,
  stagingDir: string,
  modlist: ModlistEntry[],
  _profile?: string,
  _prefixPath?: string,
  mode?: LinkMode,
  customRules: CustomRule[] = [],
  filemapCasing?: "lower" | "preserve",
): Promise<DeploymentResult> {
  const log: string[] = [];
  const effectiveMode: LinkMode = mode || "symlink";

  const filemap = await buildFilemap(modlist, stagingDir, gamePath, {
    casingMode: filemapCasing,
  });
  log.push(`Built filemap with ${Object.keys(filemap).length} entries`);

  const targetDir = gamePath;
  const preExistingSymlinks = fs.existsSync(targetDir) ? scanSymlinks(targetDir) : {};
  log.push(`Saved manifest: ${Object.keys(preExistingSymlinks).length} pre-existing symlinks`);

  try {
    // Apply routing rules: move matched files to their custom destinations
    for (const rule of customRules) {
      applyRoutingRule(rule, filemap, gamePath, log, _prefixPath);
    }

    // Deploy remaining files (not matched by any rule) to default target
    fs.mkdirSync(targetDir, { recursive: true });
    const count = linkAll(filemap, targetDir, effectiveMode);
    log.push(`Created ${count} ${effectiveMode === "symlink" ? "symlinks" : effectiveMode === "hardlink" ? "hardlinks" : "copies"}`);

    return { success: true, log, filemap };
  } catch (err) {
    log.push(`Deploy failed: ${String(err)}. Rolling back...`);
    for (const relativePath of Object.keys(filemap)) {
      const targetPath = path.join(targetDir, relativePath);
      try {
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      } catch { /* skip */ }
    }
    restoreSymlinks(preExistingSymlinks, targetDir);
    return { success: false, log, filemap: {} };
  }
}

function applyRoutingRule(
  rule: CustomRule,
  filemap: Record<string, string>,
  gamePath: string,
  log?: (msg: string) => void,
  prefixPath?: string,
): void {
  const { dest, filenames, extensions, folders, flatten, looseOnly, toPrefix } = rule;
  const baseDir = toPrefix && prefixPath ? prefixPath : gamePath;

  const matches: Array<{ relPath: string; sourcePath: string }> = [];

  for (const [relPath, sourcePath] of Object.entries(filemap)) {
    const basename = path.basename(relPath);
    const dir = path.dirname(relPath);
    const isRoot = dir === ".";

    let matched = false;

    // Check filename match (supports glob *)
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

    // Check folder match
    if (!matched && folders) {
      const topFolder = relPath.split(/[/\\]/)[0];
      if (folders.some(f => f.toLowerCase() === topFolder.toLowerCase())) {
        matched = true;
      }
    }

    // Check extension match
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
    const targetPath = path.join(baseDir, dest, destRelPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    try {
      createSymlink(sourcePath, targetPath);
    } catch { /* */ }
    log?.(`  Routed ${relPath} → ${path.join(dest, destRelPath)}`);
  }
}

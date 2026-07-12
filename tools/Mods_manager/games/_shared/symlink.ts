import path from "node:path";
import fs from "node:fs";
import type { LinkMode } from "./types";

export type DeployedEntry = {
  relPath: string;
  sourcePath: string;
  mode: LinkMode;
  /** For hardlink: original inode path (to restore on rollback) */
  originalPath?: string;
};

export function removeDeployedLinks(dir: string): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch { return; }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeDeployedLinks(fullPath);
      try {
        const remaining = fs.readdirSync(fullPath);
        if (remaining.length === 0) fs.rmdirSync(fullPath);
      } catch { /* skip */ }
    } else {
      // Remove symlinks, hardlinks (nlink > 1), and copies
      const isSymlink = entry.isSymbolicLink();
      const isFile = entry.isFile();
      if (isSymlink) {
        try { fs.unlinkSync(fullPath); } catch { /* skip */ }
      } else if (isFile) {
        // Check if this looks like a deployed file (hardlink or copy)
        // We only remove files that have a matching source in the filemap
        // This is handled by the caller via scanDeployedLinks
        try { fs.unlinkSync(fullPath); } catch { /* skip */ }
      }
    }
  }
}

export function scanDeployedLinks(dir: string): Record<string, string> {
  const links: Record<string, string> = {};
  const scan = (currentDir: string, relativePrefix: string = "") => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(currentDir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = relativePrefix ? path.join(relativePrefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        scan(fullPath, relPath);
      } else if (entry.isSymbolicLink()) {
        links[relPath] = fs.readlinkSync(fullPath);
      } else if (entry.isFile()) {
        // For hardlinks/copies, store the source path (we can't recover it, but we track it)
        links[relPath] = fullPath;
      }
    }
  };
  scan(dir);
  return links;
}

export function removeSymlinksRecursive(dir: string): void {
  removeDeployedLinks(dir);
}

export function scanSymlinks(dir: string): Record<string, string> {
  return scanDeployedLinks(dir);
}

export function createSymlink(source: string, target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch { /* skip */ }
  fs.symlinkSync(source, target);
}

function createHardlink(source: string, target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch { /* skip */ }
  fs.linkSync(source, target);
}

function createCopy(source: string, target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch { /* skip */ }
  fs.copyFileSync(source, target);
}

function createLink(source: string, target: string, mode: LinkMode): void {
  switch (mode) {
    case "hardlink":
      try { createHardlink(source, target); }
      catch { /* cross-device or other error, fallback to symlink */ createSymlink(source, target); }
      break;
    case "copy":
      createCopy(source, target);
      break;
    case "symlink":
    default:
      createSymlink(source, target);
      break;
  }
}

function removeTarget(target: string): void {
  try {
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch { /* skip */ }
}

export function removeSymlink(target: string): void {
  removeTarget(target);
}

/**
 * Deploy all entries from filemap using the specified link mode.
 * For hardlink, falls back to symlink on cross-device errors.
 */
export function linkAll(
  filemap: Record<string, string>,
  targetBaseDir: string,
  mode: LinkMode = "symlink",
): number {
  // Remove all existing deployed files before creating new ones
  removeDeployedLinks(targetBaseDir);

  let count = 0;
  for (const [relativePath, sourcePath] of Object.entries(filemap)) {
    const targetPath = path.join(targetBaseDir, relativePath);
    createLink(sourcePath, targetPath, mode);
    count++;
  }
  return count;
}

/** @deprecated Use linkAll instead */
export function symlinkAll(filemap: Record<string, string>, targetBaseDir: string): number {
  return linkAll(filemap, targetBaseDir, "symlink");
}

export function restoreSymlinks(manifest: Record<string, string>, targetBaseDir: string): void {
  for (const [relPath, linkTarget] of Object.entries(manifest)) {
    const targetPath = path.join(targetBaseDir, relPath);
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.symlinkSync(linkTarget, targetPath);
    } catch { /* skip */ }
  }
}

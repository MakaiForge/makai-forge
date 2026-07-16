import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { InstalledTool } from "./types";
import { findToolByFolder, getTools } from "./tools";
import { logger } from "@main/services/logger";

const PROTON_TOOLS = getTools();

const BASE_DIR = path.join(app.getPath("userData"), "compat-tools");

const CATEGORY_DIRS: Record<string, string> = {
  proton: "compatibilitytools.d",
  wine: "runners/wine",
  dxvk: "runtime/dxvk",
  vkd3d: "runtime/vkd3d",
};

const IGNORE_PATTERNS = [
  "lib",
  "dist",
  "files",
  "share",
  "bin",
  "usr",
  "wine",
  "drive_c",
  "client",
  "server",
  "bin64",
  "lib64",
  "resources",
  "data",
  "fonts",
  "themes",
  "icons",
  "locales",
  "plugins",
  "modules",
  "node_modules",
];

export function getInstallDir(): string {
  return BASE_DIR;
}

export function getCategoryDir(category: string): string {
  return path.join(BASE_DIR, CATEGORY_DIRS[category] || category);
}

function isInternalFolder(entry: string): boolean {
  const lower = entry.toLowerCase();
  return IGNORE_PATTERNS.some((p) => lower === p || lower.includes(p));
}

export function getInstalledTools(): InstalledTool[] {
  const installed: InstalledTool[] = [];
  const seenPaths = new Set<string>();

  for (const tool of PROTON_TOOLS) {
    const categoryDir = getCategoryDir(tool.category);
    if (!fs.existsSync(categoryDir)) continue;

    try {
      const entries = fs.readdirSync(categoryDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const entryName = entry.name;
        if (isInternalFolder(entryName)) continue;

        const entryPath = path.join(categoryDir, entryName);
        if (seenPaths.has(entryPath)) continue;

        const matchedTool = findToolByFolder(entryName);
        if (!matchedTool) continue;

        seenPaths.add(entryPath);
        installed.push({
          tool: matchedTool,
          version: entryName,
          path: entryPath,
        });
      }
    } catch (e) {
      logger.error(`Error reading ${categoryDir}:`, e);
    }
  }

  return installed;
}

export function isToolInstalled(toolId: string, version: string): boolean {
  const installed = getInstalledTools();
  const tool = installed.find((i) => i.tool.id === toolId);
  if (!tool) return false;

  const installedVersion = tool.version.toLowerCase();
  const searchVersion = version.toLowerCase().replace(/^v/, "");

  return (
    installedVersion.includes(searchVersion) ||
    searchVersion.includes(installedVersion)
  );
}

export function removeTool(toolPath: string): boolean {
  if (!fs.existsSync(toolPath)) {
    return false;
  }

  try {
    fs.rmSync(toolPath, { recursive: true, force: true });
    logger.info(`Removed ${toolPath}`);
    return true;
  } catch (error) {
    logger.error(`Failed to remove ${toolPath}:`, error);
    return false;
  }
}

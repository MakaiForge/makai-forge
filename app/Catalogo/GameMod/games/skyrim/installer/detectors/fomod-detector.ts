import fs from "node:fs";
import path from "node:path";

export function detectFomod(extractedDir: string): boolean {
  const fomodDir = findFomodDir(extractedDir);
  if (!fomodDir) return false;
  return hasModuleConfig(fomodDir);
}

function findFomodDir(dir: string): string | null {
  const fomodPath = path.join(dir, "fomod");
  if (fs.existsSync(fomodPath)) return fomodPath;
  const lower = path.join(dir, "Fomod");
  if (fs.existsSync(lower)) return lower;
  return null;
}

function hasModuleConfig(fomodDir: string): boolean {
  const candidates = [
    path.join(fomodDir, "ModuleConfig.xml"),
    path.join(fomodDir, "moduleconfig.xml"),
  ];
  return candidates.some(c => fs.existsSync(c));
}

export interface FomodInfo {
  fomodDir: string;
  configPath: string;
}

export function getFomodInfo(extractedDir: string): FomodInfo | null {
  const fomodDir = findFomodDir(extractedDir);
  if (!fomodDir) return null;
  const configPath = [
    path.join(fomodDir, "ModuleConfig.xml"),
    path.join(fomodDir, "moduleconfig.xml"),
  ].find(c => fs.existsSync(c));
  if (!configPath) return null;
  return { fomodDir, configPath };
}

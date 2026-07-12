export interface GameEntry {
  name: string;
  path: string;
  gameId?: string;
}

export interface ProfileEntry {
  name: string;
  active: boolean;
}

export type { ModlistEntry } from "@types";

export interface ModMedia {
  hasPreview: boolean;
  hasReadme: boolean;
}

export interface FileTreeEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileTreeEntry[];
}

export interface IniFileEntry {
  name: string;
  path: string;
  content: string;
}

export interface PluginEntry {
  name: string;
  enabled: boolean;
  masters?: string[];
  modName?: string;
}

export interface ModPluginRow {
  name: string;
  modName: string;
}

export interface FileConflict {
  relativePath: string;
  mods: { name: string; priority: number }[];
  winner: string;
  type: "asset" | "plugin" | "script";
}

export interface DeploymentResult {
  success: boolean;
  log: string[];
  filemap: Record<string, string>;
}

export interface DeployAction {
  action: "copy" | "remove";
  file: string;
}

export interface DeployResult {
  success: boolean;
  filesCopied: number;
  log: string[];
  conflicts?: FileConflict[];
}

export type RightTab = "files" | "ini" | "data" | "fomod";

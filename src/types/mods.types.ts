export interface ModManagerGameConfig {
  activeProfile: string;
  deployMethod: "symlink" | "hardlink" | "copy";
  stagingDir: string;
  downloadsDir: string;
  gamePath: string;
  protonPrefix: string;
}

export interface ModEntry {
  name: string;
  version: string;
  source: "manual" | "file";
  installDate: number;
  size: number;
  hasFomod: boolean;
  fomodSelections?: Record<string, string[]>;
  plugins: string[];
  hasSkse: boolean;
  category?: string;
}

export interface FomodComponent {
  name: string;
  description: string;
  enabled: boolean;
  files: string[];
  sourceFiles?: { source: string; destination: string }[];
}

export interface ModlistEntry {
  name: string;
  enabled: boolean;
  locked: boolean;
  isSeparator: boolean;
  version?: string;
  priority?: number;
  stagingDir?: string;
  plugins?: string[];
  hasFomod?: boolean;
  hasSkse?: boolean;
  fomodComponents?: FomodComponent[];
  /** Inventário de arquivos do mod (usado para detecção de conflitos) */
  inventory?: ModInventory;
}

export interface ModMeta {
  name: string;
  version: string;
  source: "manual" | "file";
  installDate: number;
  size: number;
  hasFomod: boolean;
  fomodSelections?: Record<string, string[]>;
  plugins: string[];
  hasSkse: boolean;
  category?: string;
}

export interface FomodConfig {
  name: string;
  module_image_path?: string;
  steps: FomodStep[];
}

export interface FomodStep {
  name: string;
  groups: FomodGroup[];
}

export interface FomodGroup {
  name: string;
  type: "SelectAll" | "SelectAtLeastOne" | "SelectAtMostOne" | "SelectExactlyOne";
  plugins: FomodPlugin[];
}

export interface FomodPlugin {
  name: string;
  description: string;
  type?: string;
  image_path?: string;
  condition_flags?: Record<string, string>;
}

export interface ModFileEntry {
  relativePath: string;
  relativePathLower: string;
  size: number;
  isScriptExtender: boolean;
  isPlugin: boolean;
}

export interface ModInventory {
  modName: string;
  files: ModFileEntry[];
  scriptExtenderFiles: ModFileEntry[];
  pluginFiles: string[];
  hasFomod: boolean;
  previewFiles?: ModFileEntry[];
  readmeFiles?: ModFileEntry[];
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
  error?: string | null;
}

export interface PluginEntry {
  name: string;
  enabled: boolean;
}



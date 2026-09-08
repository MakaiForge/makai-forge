export interface ScriptFile {
  url: string;
}

export interface InstallConfig {
  dxvk: boolean | null;
  vkd3d: boolean | null;
  esync: boolean | null;
  fsync: boolean | null;
  env: Record<string, string>;
  winetricks: string[];
}

export interface InstallerConfig {
  exe_name: string;
  extract_only: boolean;
}

export interface ParsedScriptYaml {
  proton: Record<string, string>;
  config: Record<string, boolean | string | string[]>;
  env: Record<string, string>;
  wine_overrides: Record<string, string>;
  game: Record<string, string>;
  steam_app_id: string | null;
  exclude_processes: string;
  install: InstallConfig;
  installer: InstallerConfig;
  files: ScriptFile[];
}

export interface DownloadResult {
  folderName: string;
  destDir: string;
  archivePath: string;
}

export interface InstallScriptResult {
  success: boolean;
  shop: string;
  objectId: string;
  gameId: string;
  title: string;
  folderName: string;
  hasProton: boolean;
  protonVersion: string | null;
  protonFork: string | null;
  hasInstallConfig: boolean;
  hasInstallerConfig: boolean;
  installerConfig: InstallerConfig;
  error?: string;
}

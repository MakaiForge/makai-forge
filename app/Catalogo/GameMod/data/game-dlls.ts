export interface WineDllOverrideRange {
  start: number;
  end: number;
  mode: string;
}

export interface ScriptExtender {
  name: string;
  loaderExe: string;
  downloadUrl: string;
  installPath: string;
}

export interface GameDllEntry {
  gameId: string;
  name: string;
  steamIds: string[];
  detectExe: string;
  detectExeAlts?: string[];
  nexusDomain?: string;
  wineDllOverrides?: Record<string, string>;
  wineDllOverridesRange?: Record<string, WineDllOverrideRange>;
  autoInstallDeps?: string[];
  winetricksComponents?: string[];
  scriptExtender?: ScriptExtender;
  reshadeDll?: string;
  reshadeArch?: number;
  frameworks?: Record<string, string>;
}

export interface GameDllCatalog {
  _version: number;
  _comment: string;
  games: GameDllEntry[];
}

export interface RomSite {
  name: string;
  url: string;
  imageUrl?: string;
}

export interface RunnerRepo {
  owner: string;
  repo: string;
}

export type RunnerCategory =
  | "nintendo"
  | "sony"
  | "sega"
  | "arcade"
  | "computers"
  | "microsoft"
  | "multi"
  | "obscure";

export type RunnerType = "standalone" | "libretro";

export interface RunnerDefinition {
  id: string;
  humanName: string;
  description: string;
  category: RunnerCategory;
  platforms: string[];
  runnerType?: RunnerType;
  libretroCoreId?: string;
  repo?: RunnerRepo;
  downloadUrl?: string;
  executablePath: string;
  launchArgs: (romPath: string) => string[];
  assetPattern?: string;
  romSites: RomSite[];
  isAbandoned?: boolean;
  isPaid?: boolean;
  paidUrl?: string;
  notes?: string;
}

export interface RunnerStatus {
  id: string;
  isInstalled: boolean;
  installedVersion?: string;
  latestVersion?: string;
  updateAvailable: boolean;
  installPath?: string;
}

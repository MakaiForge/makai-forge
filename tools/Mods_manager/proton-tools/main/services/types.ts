export interface ProtonToolExtra {
  githubUrl?: string;
  features?: string[];
  author?: string;
  license?: string;
}

export interface ProtonTool {
  id: string;
  title: string;
  description: string;
  category: "proton" | "wine" | "dxvk" | "vkd3d";
  endpoint: string;
  assetPosition: number;
  directoryNameFormat: string;
  supportLatest: boolean;
  type: "github" | "forgejo" | "gitlab" | "github-action";
  preferTarball?: boolean;
  requestAssetExclude?: string[];
  requestAssetFilter?: string[];
  extra?: ProtonToolExtra;
}

export interface ProtonRelease {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
  html_url?: string;
  published_at: string;
  tarball_url?: string;
  zipball_url?: string;
  run_id?: number;
  artifacts_url?: string;
}

export interface InstalledTool {
  tool: ProtonTool;
  version: string;
  path: string;
}

export interface DownloadOptions {
  toolId: string;
  release: ProtonRelease;
  onProgress?: (percent: number, speed: string) => void;
}

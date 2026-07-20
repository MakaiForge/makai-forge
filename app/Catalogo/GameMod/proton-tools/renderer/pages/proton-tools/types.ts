export type Tab = "tools" | "downloads" | "installed" | "games";

export interface ProtonToolExtra {
  githubUrl?: string;
  author?: string;
  license?: string;
  features?: string[];
}

export interface ProtonTool {
  id: string;
  title: string;
  description: string;
  category: string;
  endpoint?: string;
  extra?: ProtonToolExtra;
}

export interface ToolInfo {
  id: string;
  title: string;
  description: string;
  endpoint?: string;
  version?: string;
  body?: string;
  extra?: {
    githubUrl?: string;
    author?: string;
    license?: string;
    features?: string[];
  };
}

export interface InstalledTool {
  tool: { id: string; title: string };
  version: string;
  path: string;
}

export interface DownloadState {
  toolId: string;
  version: string;
  percent: number;
  speed?: string;
}

export interface ProtonRelease {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
  published_at: string;
  body?: string;
  html_url?: string;
}

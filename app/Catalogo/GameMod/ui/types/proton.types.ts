export interface ProtonFork {
  fork: string;
  name: string;
  version: string;
  tier: string;
  tierScore: number;
  confidence: string;
  note?: string;
}

export interface ProtonInfo {
  appId: string | null;
  currentProton: { name: string; priority: string } | null;
  recommendation: { primary: ProtonFork | null; alternatives: ProtonFork[] } | null;
  installedForks: ProtonFork[];
  recommendedDlls: any | null;
  prefixPath: string | null;
  steamPath: string | null;
  protonPath: string | null;
  compatInfo: any | null;
  error: string | null;
  status: string;
}

export interface InstalledProtonTool {
  version: string;
  path: string;
  tool?: {
    id: string;
    title?: string;
  };
}

export interface ProtonToolGroup {
  id: string;
  title: string;
  description: string;
  category: string;
  installed: { version: string; path: string }[];
}

export interface ProtonConfig {
  gamePath: string;
  winePrefix: string;
  protonVersion: string;
  envVars: Record<string, string>;
  launchOptions: string;
  useDxvk: boolean;
  useVkd3d: boolean;
  selectedDxvk: string;
  selectedVkd3d: string;
  dxvkVersion: string;
  vkd3dVersion: string;
}

export const TIER_COLORS: Record<string, string> = {
  gold: "#FFD700",
  silver: "#C0C0C0",
  bronze: "#CD7F32",
  platinum: "#E5E4E2",
};

export const TIER_BG_COLORS: Record<string, string> = {
  gold: "rgba(255, 215, 0, 0.15)",
  silver: "rgba(192, 192, 192, 0.15)",
  bronze: "rgba(205, 127, 50, 0.15)",
  platinum: "rgba(229, 228, 226, 0.15)",
};

export const CONFIDENCE_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: "Alta", color: "#27ae60" },
  medium: { label: "Média", color: "#f39c12" },
  low: { label: "Baixa", color: "#e74c3c" },
  genérico: { label: "Palpite", color: "#888" },
};

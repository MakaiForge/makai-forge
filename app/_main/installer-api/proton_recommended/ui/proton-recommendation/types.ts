import type { ProtonVersion, ProtonFork } from "@types";

export interface ProtonDbVersion {
  version: string;
  total: number;
  positive: number;
  negative: number;
  positiveRatio: number;
}

export interface ProtonDbData {
  gameId: string;
  steamAppId: string;
  totalReports: number;
  versions: ProtonDbVersion[];
  recommended: string[];
}

export interface ProtonRecommendationModalProps {
  visible: boolean;
  gameId: string;
  gameTitle: string;
  installedProtons: ProtonVersion[];
  mode?: "install" | "switch";
  currentProtonPath?: string;
  onClose: () => void;
  onSelect: (protonPath: string) => void;
  onSwitchProton?: (
    protonPath: string
  ) => Promise<
    | {
        ok: boolean;
        data?: { savesRestored: number; dllsInstalled: string[] };
        error?: string;
      }
    | void
  >;
  onDownloadAndSelect?: (fork: ProtonFork) => Promise<void>;
}

export interface DownloadProgress {
  status: string;
  percent: number;
  gameTitle?: string;
}

export interface CatalogFork {
  id: string;
  name: string;
  ranking: string;
  tierScore: number;
  versions: string[];
}

export interface ManualInstalled {
  version: string;
  path: string;
}

export interface ManualGroup {
  id: string;
  title: string;
  description: string;
  category: string;
  installed: ManualInstalled[];
}

export interface SwitchResult {
  ok: boolean;
  msg: string;
}

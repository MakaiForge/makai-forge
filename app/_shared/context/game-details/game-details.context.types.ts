import type {
  GameRepack,
  GameShop,
  LibraryGame,
  ShopDetailsWithAssets,
} from "@types";

export type GameOptionsCategoryId =
  | "general"
  | "locations"
  | "assets"
  | "protonforge_cloud"
  | "compatibility"
  | "downloads"
  | "danger_zone";

export interface GameDetailsContext {
  game: LibraryGame | null;
  shopDetails: ShopDetailsWithAssets | null;
  repacks: GameRepack[];
  shop: GameShop;
  gameTitle: string;
  isGameRunning: boolean;
  isLoading: boolean;
  objectId: string | undefined;
  showRepacksModal: boolean;
  showGameOptionsModal: boolean;
  gameOptionsInitialCategory: GameOptionsCategoryId;
  hasNSFWContentBlocked: boolean;
  lastDownloadedOption: GameRepack | null;
  isTransferring: boolean;
  transferProgress: number;
  selectGameExecutable: () => Promise<string | null>;
  updateGame: () => Promise<void>;
  setShowRepacksModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowGameOptionsModal: React.Dispatch<React.SetStateAction<boolean>>;
  setGameOptionsInitialCategory: React.Dispatch<
    React.SetStateAction<GameOptionsCategoryId>
  >;
  setHasNSFWContentBlocked: React.Dispatch<React.SetStateAction<boolean>>;
  cancelTransfer: () => void;
}

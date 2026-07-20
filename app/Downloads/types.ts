import type { GameShop, LibraryGame, SeedingStatus } from "@types";

export interface DownloadGroupProps {
  library: LibraryGame[];
  title: string;
  openDeleteGameModal: (shop: GameShop, objectId: string) => void;
  openGameInstaller: (shop: GameShop, objectId: string) => void;
  openRemoveGameModal: (shop: GameShop, objectId: string, title: string) => void;
  seedingStatus: SeedingStatus[];
  queuedGameIds?: string[];
}

export interface LibraryGroup {
  title: string;
  library: LibraryGame[];
  queuedGameIds: string[];
}

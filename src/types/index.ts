import type { DownloadSourceStatus, Downloader } from "@shared";
import type { SteamAppDetails } from "./steam.types";
import type { Download, Game, Subscription } from "./store.types";
import type { GameShop } from "./game.types";

export type FriendRequestAction = "ACCEPTED" | "REFUSED" | "CANCEL";


export interface DiskUsage {
  free: number;
  total: number;
}

export interface SystemSpecs {
  /** Versão do formato — bump força re-coleta (ex.: clock corrigido via lscpu) */
  version?: number
  collectedAt: number
  cpu: {
    model: string
    cores: number
    baseClockGhz: number
  }
  memory: {
    totalBytes: number
    totalGb: number
  }
  gpu: {
    name: string
    vendor: "nvidia" | "amd" | "intel" | "unknown"
    vramMb: number
  }
  os: {
    platform: string
    release: string
  }
}

export type GameCompatibilityLevel = "ok" | "weak" | "no" | "unknown";

export interface GameCompatibilityResult {
  level: GameCompatibilityLevel
  label: string
  below: string[]
  met: string[]
  checkedAt: number
}

export interface GameRepack {
  id: string;
  title: string;
  fileSize: string | null;
  uris: string[];
  unavailableUris: string[];
  uploadDate: string | null;
  downloadSourceId: string;
  downloadSourceName: string;
  createdAt: string;
  recommended?: boolean;
}

export interface DownloadSource {
  id: string;
  name: string;
  url: string;
  status: DownloadSourceStatus;
  downloadCount: number;
  fingerprint?: string;
  isRemote?: true;
  createdAt: string;
}

export interface ProtonVersion {
  name: string;
  path: string;
  source?: "steam" | "compatibility_tools" | "unknown" | "fork_catalog";
  isInstalled?: boolean;
  forkId?: string;
  version?: string;
  tier?: string;
  tierScore?: number;
}

export interface ShopAssets {
  objectId: string;
  shop: GameShop;
  title: string;
  iconUrl: string | null;
  libraryHeroImageUrl: string | null;
  libraryImageUrl: string | null;
  logoImageUrl: string | null;
  logoPosition: string | null;
  coverImageUrl: string | null;
  downloadSources: string[];
  downloads?: GameRepack[];
  screenshots?: string[];
  shortDescription?: string | null;
  pcRequirements?: Record<string, string> | null;
}

export type ShopDetails = SteamAppDetails & {
  objectId: string;
};

export type ShopDetailsWithAssets = ShopDetails & {
  assets: ShopAssets | null;
};

export interface TorrentFile {
  index: number;
  path: string;
  length: number;
}

export interface TorrentFilesResponse {
  infoHash: string;
  name: string;
  totalSize: number;
  files: TorrentFile[];
}

export type UserGame = {
  objectId: string;
  shop: GameShop;
  title: string;
  playTimeInSeconds: number;
  lastTimePlayed: Date | null;
  hasManuallyUpdatedPlaytime: boolean;
  isFavorite: boolean;
  isPinned: boolean;
  pinnedDate?: Date | null;
} & ShopAssets;

export interface UserLibraryResponse {
  totalCount: number;
  library: UserGame[];
  pinnedGames: UserGame[];
}

export interface GameCollection {
  id: string;
  name: string;
  gamesCount: number;
}

export interface GameRunning {
  id: string;
  title: string;
  iconUrl: string | null;
  objectId: string;
  shop: GameShop;
  sessionDurationInMillis: number;
}

export interface Steam250Game {
  title: string;
  objectId: string;
}

export interface SteamGame {
  id: number;
  name: string;
  clientIcon: string | null;
}

export type AppUpdaterEvent =
  | { type: "update-available"; info: { version: string } }
  | { type: "update-downloaded" };

/* Events */
export interface StartGameDownloadPayload {
  objectId: string;
  title: string;
  shop: GameShop;
  uri: string;
  downloadPath: string;
  downloader: Downloader;
  automaticallyExtract: boolean;
  automaticallyDeleteArchiveFiles: boolean;
  fileSize?: string | null;
  fileIndices?: number[];
  selectedFilesSize?: number | null;
}

export interface UserFriend {
  id: string;
  displayName: string;
  profileImageUrl: string | null;
  currentGame:
    | (ShopAssets & {
        sessionDurationInSeconds: number;
      })
    | null;
}

export interface UserFriends {
  totalFriends: number;
  friends: UserFriend[];
}

export interface UserBlocks {
  totalBlocks: number;
  blocks: UserFriend[];
}

export interface FriendRequestSync {
  friendRequestCount: number;
}

export interface NotificationSync {
  notificationCount: number;
}

export interface FriendRequest {
  id: string;
  displayName: string;
  profileImageUrl: string | null;
  type: "SENT" | "RECEIVED";
}

export interface UserRelation {
  AId: string;
  BId: string;
  status: "ACCEPTED" | "PENDING";
}

export type UserProfileCurrentGame = GameRunning &
  ShopAssets & {
    sessionDurationInSeconds: number;
  };

export type ProfileVisibility = "PUBLIC" | "PRIVATE" | "FRIENDS";

export interface Badge {
  name: string;
  title: string;
  description: string;
  badge: {
    url: string;
  };
}

export interface SiteBadge {
  id: number;
  name: string;
  icon: string;
  description: string;
  earned_at: string;
  pinned: number;
}

export interface UserDetails {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  profileImageUrl: string | null;
  backgroundImageUrl: string | null;
  profileVisibility: ProfileVisibility;
  bio: string;

  subscription: Subscription | null;
  karma: number;
  quirks?: {
    backupsPerGameLimit: number;
  };
}

export interface UserProfile {
  id: string;
  displayName: string;
  profileImageUrl: string | null;
  email: string | null;
  backgroundImageUrl: string | null;
  profileVisibility: ProfileVisibility;
  libraryGames: UserGame[];
  recentGames: UserGame[];
  friends: UserFriend[];
  totalFriends: number;
  relation: UserRelation | null;
  currentGame: UserProfileCurrentGame | null;
  bio: string;
  hasActiveSubscription: boolean;
  karma: number;
  quirks: {
    backupsPerGameLimit: number;
  };
  badges: string[];
  hasCompletedWrapped2025: boolean;
}

export interface UpdateProfileRequest {
  displayName?: string;
  profileVisibility?: ProfileVisibility;
  profileImageUrl?: string | null;
  backgroundImageUrl?: string | null;
  bio?: string;
  language?: string;
}

export interface DownloadSourceDownload {
  title: string;
  uris: string[];
  uploadDate: string;
  fileSize: string;
}

export interface TrendingGame extends ShopAssets {
  description: string | null;
  uri: string;
}

export interface GameArtifact {
  id: string;
  artifactLengthInBytes: number;
  downloadOptionTitle: string | null;
  createdAt: string;
  updatedAt: string;
  hostname: string;
  downloadCount: number;
  label?: string;
  isFrozen: boolean;
}

export type NotificationType =
  | "FRIEND_REQUEST_RECEIVED"
  | "FRIEND_REQUEST_ACCEPTED"
  | "BADGE_RECEIVED";

export type LocalNotificationType =
  | "EXTRACTION_COMPLETE"
  | "DOWNLOAD_COMPLETE"
  | "UPDATE_AVAILABLE"
  | "SCAN_GAMES_COMPLETE";

export interface Notification {
  id: string;
  type: NotificationType;
  variables: Record<string, string>;
  pictureUrl: string | null;
  url: string | null;
  isRead: boolean;
  priority: number;
  createdAt: string;
}

export interface LocalNotification {
  id: string;
  type: LocalNotificationType;
  title: string;
  description: string;
  pictureUrl: string | null;
  url: string | null;
  isRead: boolean;
  createdAt: string;
}

export type MergedNotification =
  | (Notification & { source: "api" })
  | (LocalNotification & { source: "local" });

export interface NotificationsResponse {
  notifications: Notification[];
  pagination: {
    total: number;
    take: number;
    skip: number;
    hasMore: boolean;
  };
}

export interface NotificationCountResponse {
  count: number;
}

export interface CatalogueSearchPayload {
  title: string;
  downloadSourceFingerprints: string[];
  tags: number[];
  publishers: string[];
  genres: string[];
  developers: string[];
  protondbSupportBadges: (
    | "borked"
    | "bronze"
    | "silver"
    | "gold"
    | "platinum"
  )[];
  deckCompatibility: ("verified" | "playable" | "unsupported" | "unknown")[];
  releaseYear?: { gte?: number; lte?: number };
}

export interface ProtonDBData {
  tier: string | null;
  confidence: string | null;
  score: number | null;
  total: number | null;
  trendingTier: string | null;
  resolvedCategory: number | null;
  deckCompatibility: "verified" | "playable" | "unsupported" | "unknown" | null;
}

export type CatalogueSearchResult = {
  id: string;
  objectId: string;
  title: string;
  shop: GameShop;
  genres: string[];
  releaseYear: number | null;
  tier?: string | null;
  bestReportedTier?: string | null;
  protondbSupportBadge?: string | null;
  protondbSupportBadges?: string[];
  deckCompatibility?: string | null;
  deckCompatibilities?: string[];
  recommendedProton?: string | null;
  protonConfidence?: string | null;
  protonSource?: string | null;
  contentDescriptorIds?: number[];
  requiredAge?: number;
  /** Requisitos do catálogo (localSearchGames já enriquece cada jogo com estes) */
  pcRequirements?: { minimum?: string | null; recommended?: string | null } | null;
} & Pick<ShopAssets, "libraryImageUrl" | "downloadSources">;

export type LibraryGame = Game &
  Partial<ShopAssets> & {
    id: string;
    download: Download | null;
  };

export type UserGameDetails = ShopAssets & {
  id: string;
  playTimeInSeconds: number;
  lastTimePlayed: Date | null;
  isDeleted: boolean;
  isFavorite: boolean;
  friendsWhoPlayed: {
    id: string;
    displayName: string;
    profileImageUrl: string | null;
    lastTimePlayed: Date | null;
    playTimeInSeconds: number;
  }[];
};

export interface ProtonForkInfo {
  id: string;
  name: string;
  category: string;
  ranking: string;
  tierScore: number;
  description: string;
  source: string;
  features: string[];
}

export interface DealData {
  title: string;
  salePrice: number;
  normalPrice: number;
  savingsPercent: number;
  storeName: string;
  steamAppId: string;
  thumb: string;
  dealUrl: string;
}

export interface FreeGameData {
  title: string;
  url: string;
  store: string;
  image: string;
  endsAt: string;
}

export interface NewsArticle {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  sourceLang: string;
  thumbnail: string | null;
}

export interface SteamInstalledGame {
  appId: string;
  name: string;
  installDir: string;
  libraryPath: string;
  compatDataPath: string | null;
  hasPrefix: boolean;
  sizeOnDisk: number;
  executablePath: string | null;
}

export interface StoreDeal {
  storeId: string;
  storeName: string;
  price: string;
  retailPrice: string;
  currency: string;
  dealUrl: string;
}

export interface GamePrices {
  steamAppId: string;
  title: string;
  cheapest: string;
  currency: string;
  deals: StoreDeal[];
  cachedAt: number;
}

export interface SteamGameCategory {
  key: string;
  name: string;
}

export type GameOptionsCategoryId = "downloads" | "achievements" | "news" | "backups" | "settings" | "info";

export type GameSettingsCategoryId = "info" | "settings" | "backups" | "downloads";

export interface ProtonFork {
  fork: string;
  name: string;
  version: string;
  tier: string;
  tierScore: number;
  confidence: string;
  note?: string;
}

export interface ProtonRecommendation {
  game_id: string;
  title: string;
  primary: ProtonFork | null;
  alternatives: ProtonFork[];
}

export * from "./game.types";
export * from "./steam.types";
export * from "./download.types";
export * from "./ludusavi.types";
export * from "./store.types";
export * from "./theme.types";
export * from "./mods.types";

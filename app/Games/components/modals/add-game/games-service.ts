export interface GameConfig {
  objectId: string;
  shop: string;
  title: string;
  slug: string;
  runner: "proton" | "wine" | "steam";
  isDeleted: boolean;
  favorite: boolean;
  executablePath?: string;
  prefix?: string;
  coverImageUrl?: string;
  iconUrl?: string;
  logoImageUrl?: string;
  libraryImageUrl?: string;
  libraryHeroImageUrl?: string;
  playTimeInMilliseconds: number;
  lastTimePlayed: string | null;
  protonVersion?: string;
  protonPath?: string;
  wineVersion?: string;
  winePrefixPath?: string;
  launchOptions?: string;
  gameArgs?: string;
  prelaunchCommand?: string;
  postexitCommand?: string;
  env?: Record<string, string>;
  mangoHud?: boolean;
  autoRunMangohud?: boolean;
  gameMode?: boolean;
  autoRunGamemode?: boolean;
  dxvk?: boolean;
  esync?: boolean;
  fsync?: boolean;
  protonAddons?: string[];
  containerCommand?: string;
  resolution?: string;
  fpsLimit?: string;
  vsync?: string;
  renderingMode?: string;
  videoDriver?: string;
  dxvkVersion?: string;
  vulkan?: boolean;
  frameThrottle?: string;
  audioDriver?: string;
  audioChannels?: string;
  audioSampleRate?: string;
  audioInBackground?: boolean;
  threadedD3D?: boolean;
  preferSystemLibs?: boolean;
  dllOverrides?: string;
  installedSizeInBytes?: number;
  installerSizeInBytes?: number;
  downloadSource?: string;
}

const API_BASE = "/api/games";

export const gamesService = {
  async list(): Promise<GameConfig[]> {
    const res = await fetch(API_BASE);
    return res.json();
  },

  async get(id: string): Promise<GameConfig | null> {
    const res = await fetch(`${API_BASE}/${id}`);
    if (!res.ok) return null;
    return res.json();
  },

  async create(game: Partial<GameConfig>): Promise<GameConfig> {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(game),
    });
    return res.json();
  },

  async update(game: GameConfig): Promise<GameConfig> {
    const res = await fetch(`${API_BASE}/${game.objectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(game),
    });
    return res.json();
  },

  async delete(id: string): Promise<void> {
    await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
  },

  async load(): Promise<GameConfig[]> {
    return this.list();
  },
};

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
  dlls?: string[];
  winetricks?: string;
  language?: string;
  locale?: string;
  vkd3d?: boolean;
  textures?: boolean;
  dxvkAsync?: boolean;
  amdFsr?: boolean;
  amdFsrSharpness?: string;
  fluidResolution?: boolean;
  superResolution?: boolean;
  esyncManual?: boolean;
  fsyncManual?: boolean;
  enableEac?: boolean;
  enableBattlEye?: boolean;
  vkd3dVersion?: string;
  d3dExtras?: boolean;
  d3dExtrasVersion?: string;
  virtualDesktop?: boolean;
  wineDesktop?: string;
  dpiScaling?: boolean;
  explicitDpi?: string;
  mouseWarpOverride?: string;
  graphicsBackend?: string;
  installedSizeInBytes?: number | null;
  installerSizeInBytes?: number | null;
}

export const gamesService = {
  async getAll(): Promise<GameConfig[]> {
    try {
      const library = await window.electron.getLibrary();
      const games = library as unknown as GameConfig[];
      return games.map((g: any) => ({
        ...g,
        isDeleted: g.isDeleted || false,
        favorite: g.favorite || false,
        runner: (["proton", "wine", "steam"] as const).includes(g.runner)
          ? g.runner
          : "proton",
        slug: (g.title || "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
      })) as GameConfig[];
    } catch (error) {
      console.error("Failed to load games:", error);
      return [];
    }
  },

  async getById(objectId: string): Promise<GameConfig | null> {
    const games = await this.getAll();
    return games.find((g) => g.objectId === objectId) || null;
  },

  async save(game: GameConfig): Promise<void> {
    try {
      console.log("Adding game to Library:", game.title);
      await window.electron.addCustomGameToLibrary(
        game.title,
        game.executablePath || "",
        game.iconUrl || game.coverImageUrl,
        game.logoImageUrl,
        game.libraryHeroImageUrl,
        game.runner,
        game.protonVersion,
        game.protonPath,
        game.winePrefixPath || game.prefix
      );
      console.log("Game added to Library:", game.title);
    } catch (error) {
      console.error("Failed to add game:", error);
      throw error;
    }
  },

  async delete(shop: string, objectId: string): Promise<void> {
    try {
      await window.electron.deleteGameCompletely(shop as any, objectId);
    } catch (error) {
      console.error("Failed to delete game:", error);
    }
  },

  async deleteWithPrefix(shop: string, objectId: string): Promise<void> {
    try {
      await window.electron.deleteGameWithPrefix(shop as any, objectId);
    } catch (error) {
      console.error("Failed to delete game with prefix:", error);
    }
  },

  async update(game: GameConfig): Promise<void> {
    try {
      console.log("Updating game config:", game.title);
      await window.electron.updateGameConfig(
        game.shop as import("@types").GameShop,
        game.objectId,
        {
          title: game.title,
          executablePath: game.executablePath || '',
          runner: game.runner,
          prefix: game.winePrefixPath || game.prefix,
          winePrefixPath: game.winePrefixPath || game.prefix,
          protonVersion: game.protonVersion || '',
          protonPath: game.protonPath || '',
          wineVersion: game.wineVersion,
          gameArgs: game.launchOptions || game.gameArgs,
          launchOptions: game.launchOptions || game.gameArgs,
          prelaunchCommand: game.prelaunchCommand,
          postexitCommand: game.postexitCommand,
          env: game.env,
          mangoHud: game.autoRunMangohud ?? game.mangoHud,
          autoRunMangohud: game.autoRunMangohud ?? game.mangoHud,
          gameMode: game.autoRunGamemode ?? game.gameMode,
          autoRunGamemode: game.autoRunGamemode ?? game.gameMode,
          dxvk: game.dxvk,
          esync: game.esync,
          fsync: game.fsync,
          protonAddons: game.protonAddons,
          containerCommand: game.containerCommand,
          resolution: game.resolution,
          fpsLimit: game.fpsLimit,
          vsync: game.vsync,
          renderingMode: game.renderingMode,
          videoDriver: game.videoDriver,
          dxvkVersion: game.dxvkVersion,
          vulkan: game.vulkan,
          frameThrottle: game.frameThrottle,
          audioDriver: game.audioDriver,
          audioChannels: game.audioChannels,
          audioSampleRate: game.audioSampleRate,
          audioInBackground: game.audioInBackground,
          threadedD3D: game.threadedD3D,
          preferSystemLibs: game.preferSystemLibs,
          dllOverrides: game.dllOverrides,
          dlls: game.dlls,
          winetricks: game.winetricks,
          language: game.language,
          locale: game.locale,
          vkd3d: game.vkd3d,
          textures: game.textures,
          dxvkAsync: game.dxvkAsync,
          amdFsr: game.amdFsr,
          amdFsrSharpness: game.amdFsrSharpness,
          fluidResolution: game.fluidResolution,
          superResolution: game.superResolution,
          esyncManual: game.esyncManual,
          fsyncManual: game.fsyncManual,
          enableEac: game.enableEac,
          enableBattlEye: game.enableBattlEye,
          vkd3dVersion: game.vkd3dVersion,
          d3dExtras: game.d3dExtras,
          d3dExtrasVersion: game.d3dExtrasVersion,
          virtualDesktop: game.virtualDesktop,
          wineDesktop: game.wineDesktop,
          dpiScaling: game.dpiScaling,
          explicitDpi: game.explicitDpi,
          mouseWarpOverride: game.mouseWarpOverride,
          graphicsBackend: game.graphicsBackend,
        }
      );
      console.log("Game config updated:", game.title);
    } catch (error) {
      console.error("Failed to update game config:", error);
      throw error;
    }
  },

  generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  },

  generateId(): string {
    return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },
};

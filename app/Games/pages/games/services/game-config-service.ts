import type { GameConfig } from "@games-ui/AddGame/games-service";

export interface GameSettings {
  executablePath?: string;
  prefix?: string;
  protonVersion?: string;
  wineVersion?: string;
  gameArgs?: string;
  prelaunchCommand?: string;
  postexitCommand?: string;
  env?: Record<string, string>;
  mangoHud?: boolean;
  gameMode?: boolean;
  dxvk?: boolean;
  esync?: boolean;
  fsync?: boolean;
  protonAddons?: string[];
  resolution?: string;
  fpsLimit?: string;
}

export const gameConfigService = {
  async getSettings(game: GameConfig): Promise<GameSettings> {
    return {
      executablePath: game.executablePath,
      prefix: game.prefix,
      protonVersion: game.protonVersion,
      wineVersion: game.wineVersion,
      gameArgs: game.gameArgs,
      prelaunchCommand: game.prelaunchCommand,
      postexitCommand: game.postexitCommand,
      env: game.env,
      mangoHud: game.mangoHud,
      gameMode: game.gameMode,
      dxvk: game.dxvk,
      esync: game.esync,
      fsync: game.fsync,
      protonAddons: game.protonAddons,
      resolution: game.resolution,
      fpsLimit: game.fpsLimit,
    };
  },

  async updateSettings(
    game: GameConfig,
    settings: GameSettings
  ): Promise<void> {
    console.log("Updating game settings:", game.title, settings);

    // Usar eventos existentes do Electron
    if (settings.gameArgs) {
      await window.electron.updateLaunchOptions(
        game.shop as import("@types").GameShop,
        game.objectId,
        settings.gameArgs
      );
    }

    console.log("Settings updated successfully");
  },
};

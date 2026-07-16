import path from "node:path";
import { MakaiRPC } from "@mods-manager/services/makai-rpc";
import { logger } from "@main/services/logger";

export class MakaiTime {
  public static async runExecutable(
    executablePath: string,
    options?: {
      winePrefixPath?: string | null;
      protonPath?: string | null;
      gameId?: string | null;
      launchOptions?: string | null;
      useGamemode?: boolean;
      useMangohud?: boolean;
      customEnv?: Record<string, string>;
      onLog?: (line: string) => void;
    }
  ): Promise<void> {
    const params: Record<string, unknown> = {
      exe_path: executablePath,
      proton_path: options?.protonPath ?? "",
      prefix_path: options?.winePrefixPath ?? "",
      game_path: path.dirname(executablePath),
    };
    if (options?.customEnv) {
      params.env_overrides = options.customEnv;
    }
    if (options?.gameId) {
      params.steam_app_id = options.gameId;
    }

    try {
      await MakaiRPC.call("container_run", params);
    } catch (err) {
      logger.error("[MakaiTime] runExecutable failed", err);
      throw err;
    }
  }

  public static async runInstaller(
    executablePath: string,
    _launchParameters: string[] = [],
    options?: {
      winePrefixPath?: string | null;
      protonPath?: string | null;
      gameId?: string | null;
      launchOptions?: string | null;
      useMangohud?: boolean;
      useGamemode?: boolean;
      customEnv?: Record<string, string>;
      onLog?: (line: string) => void;
      wineDebug?: string;
    }
  ): Promise<{ exitCode: number | null; signal: string | null; exitTimestamp: number }> {
    const params: Record<string, unknown> = {
      exe_path: executablePath,
      proton_path: options?.protonPath ?? "",
      prefix_path: options?.winePrefixPath ?? "",
      game_path: path.dirname(executablePath),
    };
    if (options?.customEnv) {
      params.env_overrides = options.customEnv;
    }
    if (options?.gameId) {
      params.steam_app_id = options.gameId;
    }

    try {
      const result = await MakaiRPC.call<{ exitCode: number; signal: string | null; exitTimestamp: number }>(
        "container_run_installer",
        params,
        0,
      );
      return result;
    } catch (err) {
      logger.error("[MakaiTime] runInstaller failed", err);
      return { exitCode: -1, signal: null, exitTimestamp: Date.now() };
    }
  }
}

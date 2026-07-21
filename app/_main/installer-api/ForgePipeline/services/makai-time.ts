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

  public static async installGame(
    sourcePath: string,
    options?: {
      winePrefixPath?: string | null;
      protonPath?: string | null;
      gameId?: string | null;
      existingExePath?: string | null;
      onProgress?: (step: string, percent: number, message: string) => void;
    }
  ): Promise<{
    success: boolean;
    candidates: { path: string; name: string; size: number }[];
    suggested_dir: string | null;
    method: string;
  }> {
    const params: Record<string, unknown> = {
      source_path: sourcePath,
      prefix_path: options?.winePrefixPath ?? "",
      proton_path: options?.protonPath ?? "",
      game_id: options?.gameId ?? "",
    };
    if (options?.existingExePath) {
      params.existing_exe_path = options.existingExePath;
    }

    const progressCb = options?.onProgress;
    let progressListener: ((event: string, data: Record<string, unknown>) => void) | null = null;

    if (progressCb) {
      progressListener = (event: string, data: Record<string, unknown>) => {
        if (event === "install_progress") {
          progressCb(
            String(data.step ?? ""),
            Number(data.percent ?? 0),
            String(data.message ?? ""),
          );
        }
      };
      MakaiRPC.onEvent(progressListener);
    }

    try {
      const result = await MakaiRPC.call<{
        success: boolean;
        candidates: { path: string; name: string; size: number }[];
        suggested_dir: string | null;
        method: string;
      }>("install_game", params, 0);
      return result;
    } catch (err) {
      logger.error("[MakaiTime] installGame failed", err);
      throw err;
    } finally {
      if (progressListener) {
        MakaiRPC.removeEvent(progressListener);
      }
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

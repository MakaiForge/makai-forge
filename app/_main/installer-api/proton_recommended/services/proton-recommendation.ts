/**
 * app/_main/installer-api/proton_recommended/services/proton-recommendation.ts
 *
 * DEPRECATED — Delega para MakaiRPC (RPC unificado).
 *
 * Mantido para compatibilidade reversa. Todos os métodos agora são
 * servidos pelo server.py unificado em Mods_manager/core/.
 *
 * Electron mantém UMA única conexão RPC via MakaiRPC.
 */

import { MakaiRPC } from "@mods-manager/services/makai-rpc";
import { WindowManager } from "@main/services/window-manager";

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

export class ProtonRecommendationService {
  private static initialized = false;

  private static async ensureReady(): Promise<void> {
    if (!this.initialized) {
      try {
        await MakaiRPC.call("ping");
      } catch {
        await MakaiRPC.spawn();
      }
      this.initialized = true;
    }
  }

  static async request<T>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs: number = 120_000,
  ): Promise<T> {
    await this.ensureReady();
    return MakaiRPC.call<T>(method, params, timeoutMs);
  }

  static async recommend(gameId: string): Promise<ProtonRecommendation> {
    return this.request<ProtonRecommendation>("recommend_proton", { game_id: gameId });
  }

  static async getInstalledForks(): Promise<ProtonFork[]> {
    return this.request<ProtonFork[]>("list_available_forks", {});
  }

  static async createPrefix(
    gameId: string,
    protonPath: string,
    prefixPath?: string,
  ): Promise<{
    success: boolean;
    prefix_path: string;
    initialized: boolean;
    dlls_installed: string[];
    errors: string[];
  }> {
    return this.request("create_prefix", {
      game_id: gameId,
      proton_path: protonPath,
      prefix_path: prefixPath,
      auto_dlls: true,
    });
  }

  static async getRecommendedDlls(
    gameId: string,
  ): Promise<{
    game_id: string;
    essenciais: Record<string, unknown>[];
    opcionais: Record<string, unknown>[];
    diagnostico: Record<string, unknown>;
  }> {
    return this.request("get_recommended_dlls", { game_id: gameId });
  }

  static async installGameDlls(
    gameId: string,
    prefixPath: string,
    protonPath: string,
    extraVerbs?: string[],
    _makaitricksPath?: string | null,
  ): Promise<{ installed: string[]; errors: string[] }> {
    const params: Record<string, unknown> = {
      game_id: gameId,
      prefix_path: prefixPath,
      proton_path: protonPath,
    };
    if (extraVerbs && extraVerbs.length > 0) {
      params.extra_verbs = extraVerbs;
    }

    WindowManager.mainWindow?.webContents.send("on-install-progress", {
      status: "Installing dependencies...",
      percent: 10,
    });
    try {
      return await this.request("install_game_dlls", params, 0);
    } finally {
      WindowManager.mainWindow?.webContents.send("on-install-progress", {
        status: "Dependencies installed",
        percent: 100,
      });
    }
  }

  static async runMakaitricks(
    prefixPath: string,
    protonPath: string,
    verbs: string[],
    _makaitricksPath?: string | null,
  ): Promise<{ installed: string[]; errors: string[] }> {
    return this.request("install_makaitricks", {
      prefix_path: prefixPath,
      proton_path: protonPath,
      verbs,
    }, 0);
  }

  static async analyzeExe(
    exePath: string,
  ): Promise<{
    success: boolean;
    error?: string;
    type?: string;
    original?: string;
    clean_name?: string;
    game_name?: string | null;
    app?: string;
    protonforge?: Record<string, unknown>;
  }> {
    return this.request("analyze_exe", { exe_path: exePath });
  }

  static async getLaunchCommand(
    gameId: string,
    prefixPath: string,
    protonPath: string,
    executable: string,
    launchOptions?: string,
  ): Promise<{ command: string; args: string[]; env_vars: Record<string, string> }> {
    return this.request("get_launch_command", {
      game_id: gameId,
      prefix_path: prefixPath,
      proton_path: protonPath,
      executable,
      launch_options: launchOptions,
    });
  }

  static async checkAntiCheat(
    gameId: string,
  ): Promise<{ eac: boolean; battleye: boolean }> {
    return this.request("check_anticheat", { game_id: gameId });
  }

  static kill(): void {
    /* MakaiRPC gerencia o ciclo de vida */
  }
}

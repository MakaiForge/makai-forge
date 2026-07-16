/**
 * src/main/services/protonforge-rpc.ts
 *
 * DEPRECATED — Delegates to MakaiRPC (unified RPC).
 *
 * Mantido para compatibilidade reversa. Todos os métodos agora
 * são servidos pelo server.py unificado em Mods_manager/core/.
 *
 * Electron mantém UMA única conexão RPC via MakaiRPC.
 */

import { MakaiRPC } from "@mods-manager/services/makai-rpc";
import { logger } from "@main/services/logger";

export class ProtonForgeRPC {
  static async init(): Promise<void> {
    logger.info("[ProtonForgeRPC] init — delegating to MakaiRPC");
    try {
      await MakaiRPC.call("ping");
    } catch {
      await MakaiRPC.spawn();
    }
  }

  static async call<T = unknown>(
    method: string,
    params?: unknown,
    timeoutMs = 120_000,
  ): Promise<T> {
    return MakaiRPC.call<T>(method, params as Record<string, unknown> | undefined, timeoutMs);
  }

  static kill(): void {
    /* MakaiRPC gerencia o ciclo de vida */
  }

  static isRunning(): boolean {
    return MakaiRPC.isRunning();
  }

  static copyLogToApiDir(): void {
    /* No-op — log unificado no server.log do Mods_manager */
  }
}

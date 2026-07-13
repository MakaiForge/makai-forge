import fs from "node:fs";
import path from "node:path";
import { logger } from "@main/services";
import { getGameModule } from "@games/registry";
import { applyWineDllOverrides } from "@games/_shared/prefix";
import { seedBethesdaRegistry, verifyBethesdaRegistry } from "@prefix/core/bethesda-registry";
import type { ScanFixResult } from "@prefix/types";
import { downloadSkse } from "./skse-downloader";
import { cleanNestedPfx } from "./prefix-validator";
import { scanEnvironment } from "./environment-scanner";

export async function scanFixGame(gameId: string): Promise<ScanFixResult> {
  const env = scanEnvironment({ gameId });

  if (!env.gamePath) {
    return {
      found: false,
      steamAppId: env.steamAppId,
      error: "Jogo não encontrado. Configure manualmente em Configurações do Jogo.",
    };
  }

  // ── Fix prefix se inválido ──
  if (env.prefixPath && !env.prefixValid) {
    logger.warn(`Prefix invalid at ${env.prefixPath}, will recreate`);
    try {
      const entries = fs.readdirSync(env.prefixPath);
      for (const entry of entries) {
        fs.rmSync(path.join(env.prefixPath, entry), { recursive: true, force: true });
      }
    } catch {}
    const { ensurePrefixDir } = await import("@prefix/core/validate");
    ensurePrefixDir(env.prefixPath);
  } else if (env.prefixPath && env.prefixValid) {
    cleanNestedPfx(env.prefixPath);
  }

  // ── Fix DLL overrides ──
  if (!env.dllOverridesOk && env.prefixPath) {
    const mod = getGameModule(gameId, env.gamePath);
    const overrides = mod.getWineDllOverrides?.();
    if (overrides && Object.keys(overrides).length > 0) {
      logger.info(`DLL overrides mismatch for ${gameId}, applying`);
      applyWineDllOverrides(env.prefixPath, overrides);
    }
  }

  // ── Fix registry ──
  if (!env.registryOk && env.prefixPath) {
    const mod = getGameModule(gameId, env.gamePath);
    if (mod.bethesdaRegistryName) {
      logger.info(`Bethesda registry missing for ${gameId}, seeding`);
      seedBethesdaRegistry(env.prefixPath, env.gamePath, mod.bethesdaRegistryName);
    }
  }

  // ── Fix SKSE ──
  const skseFound = await downloadSkse(gameId, env.gamePath);

  return {
    found: true,
    gamePath: env.gamePath,
    steamAppId: env.steamAppId,
    skseFound,
    configSaved: true,
  };
}

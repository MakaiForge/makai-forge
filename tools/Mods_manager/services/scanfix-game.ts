import fs from "node:fs";
import path from "node:path";
import { logger } from "@main/services";
import type { ScanFixResult } from "@prefix/types";
import { downloadSkse } from "./skse-downloader";
import { scanEnvironment } from "./environment-scanner";

export async function scanFixGame(gameId: string): Promise<ScanFixResult> {
  // autoFix: true — scanner corrige DLL overrides, registry, nested pfx automaticamente
  const env = scanEnvironment({ gameId, autoFix: true });

  if (!env.gamePath) {
    return {
      found: false,
      steamAppId: env.steamAppId,
      error: "Jogo não encontrado. Configure manualmente em Configurações do Jogo.",
    };
  }

  // ── Fix prefix se inválido (destrutivo — scanner não faz isso) ──
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
  }

  // ── Fix SKSE (lento — scanner não faz isso) ──
  const skseFound = await downloadSkse(gameId, env.gamePath);

  return {
    found: true,
    gamePath: env.gamePath,
    steamAppId: env.steamAppId,
    skseFound,
    configSaved: true,
  };
}

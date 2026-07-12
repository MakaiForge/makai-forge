import fs from "node:fs";
import path from "node:path";
import { logger } from "@main/services";
import { getGameModule } from "@games/registry";
import { downloadSkse } from "@mods/services/skse-downloader";
import type { SendProgress } from "../types";

export interface SkseResult {
  hasSkse: boolean
  sksePath: string | null
}

export async function ensureSkse(
  gameId: string,
  gamePath: string,
  send: SendProgress,
): Promise<SkseResult> {
  const mod = getGameModule(gameId, gamePath);
  const release = mod?.getScriptExtenderRelease?.();

  if (!release) {
    send("skse", "⏭️ Jogo sem script extender conhecido", "done");
    return { hasSkse: false, sksePath: null };
  }

  const sksePath = path.join(gamePath, release.loaderName);
  const exists = fs.existsSync(sksePath);

  if (exists) {
    send("skse", `✅ ${release.loaderName} encontrado`, "done");
    return { hasSkse: true, sksePath };
  }

  send("skse", `⬇️ ${release.loaderName} não encontrado. Baixando...`, "working");

  try {
    const ok = await downloadSkse(gameId, gamePath);
    const downloaded = ok && fs.existsSync(sksePath);
    if (downloaded) {
      send("skse", `✅ ${release.loaderName} baixado e instalado`, "done");
    } else {
      send("skse", `⚠️ Falha ao baixar ${release.loaderName}. Jogo iniciará sem ele.`, "done");
    }
    return { hasSkse: downloaded, sksePath: downloaded ? sksePath : null };
  } catch (err) {
    const msg = String(err).slice(0, 120);
    logger.error(`SKSE download failed for ${gameId}: ${msg}`);
    send("skse", `⚠️ Erro: ${msg}. Jogo iniciará sem SKSE.`, "done");
    return { hasSkse: false, sksePath: null };
  }
}

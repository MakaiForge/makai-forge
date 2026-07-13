import { ModStorageService } from "@main/services";
import { getGameInfo, getGameModule } from "@games/registry";
import { detectGame as detectGameService } from "@mods/services/detection";
import { defaultStagingDir, defaultPrefixDir } from "@mods/services/steam-library";
import { expandHome } from "@mods/services/path-utils";
import path from "node:path";
import fs from "node:fs";
import type { SendProgress, PlayResult } from "../types";

export interface DetectResult {
  gameId: string
  gamePath: string
  steamAppId?: string
  prefixPath: string
  libraryPath?: string
}

export function defaultPrefixDirFromGameId(gameId: string): string {
  return defaultPrefixDir(gameId);
}

export async function detectGame(
  gameId: string,
  send: SendProgress,
): Promise<DetectResult | PlayResult> {
  send("detect", "Detectando jogo...", "working");

  let config = ModStorageService.get<any>(`game:${gameId}:config`);
  let gamePath = config?.gamePath ? expandHome(config.gamePath) : undefined;
  const info = getGameInfo(gameId);
  const mod = getGameModule(gameId);

  if (!gamePath) {
    const result = detectGameService(gameId);

    if (result.source && result.gamePath) {
      gamePath = result.gamePath;
      const staging = defaultStagingDir(gameId);
      const prefix = result.prefixPath || defaultPrefixDir(gameId);

      ModStorageService.put(`game:${gameId}:config`, {
        gamePath,
        stagingDir: staging,
        protonPrefix: prefix,
        protonVersion: "",
      });

      const sourceLabel = result.source === "steam" ? "Steam" : result.source === "gog" ? "GOG" : "localizacao alternativa";
      send("detect", `Jogo encontrado via ${sourceLabel}: ${path.basename(gamePath)}`, "done");
      return {
        gameId,
        gamePath,
        steamAppId: result.steamAppId || info?.steamAppId,
        prefixPath: prefix,
      };
    }

    send("detect", `Jogo nao encontrado. Configure manualmente em Configuracoes.`, "error", "config");
    return {
      success: false,
      error: `Jogo nao encontrado. Verifique se esta instalado ou configure manualmente.`,
      failedStep: "detect",
    };
  }

  if (!fs.existsSync(gamePath)) {
    send("detect", `Caminho configurado nao existe: ${gamePath}`, "error", "config");
    return { success: false, error: `Caminho nao encontrado: ${gamePath}`, failedStep: "detect" };
  }

  if (!mod.detect(gamePath)) {
    send("detect", `${path.basename(gamePath)} nao parece ser ${info?.name || gameId}`, "done");
  } else {
    send("detect", `Jogo encontrado: ${path.basename(gamePath)}`, "done");
  }

  const rawPrefix = config?.protonPrefix || defaultPrefixDir(gameId);
  const prefixPath = expandHome(rawPrefix);
  const steamAppId = info?.steamAppId;

  let libraryPath: string | undefined;
  const commonIdx = gamePath.lastIndexOf(path.sep + "common" + path.sep);
  if (commonIdx !== -1) {
    libraryPath = gamePath.slice(0, commonIdx);
  } else {
    const compatIdx = prefixPath.lastIndexOf(path.sep + "compatdata" + path.sep);
    if (compatIdx !== -1) {
      libraryPath = prefixPath.slice(0, compatIdx);
    }
  }

  return {
    gameId,
    gamePath,
    steamAppId,
    prefixPath,
    libraryPath,
  };
}

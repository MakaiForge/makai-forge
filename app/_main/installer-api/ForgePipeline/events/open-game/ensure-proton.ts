import type { Game, UserPreferences } from "@types";
import { db, gamesStore, storeKeys } from "@main/store";
import { Umu } from "@main/services";
import { downloadTool } from "@proton/main/services/index";
import { sendProgress } from "./send-progress";
import { findInstalledProton, extractToolId, fetchRelease } from "./proton-helpers";
import path from "node:path";
import fs from "node:fs";

export async function ensureProtonAvailable(
  game: Game,
  gameKey: string
): Promise<string | null> {
  let protonPathFinal = game.protonPath;

  if (protonPathFinal && fs.existsSync(path.join(protonPathFinal, "proton"))) {
    return protonPathFinal;
  }

  if (game.protonVersion) {
    sendProgress("checking", `Verificando Proton ${game.protonVersion}...`);
    let installed = findInstalledProton(game.protonVersion);
    if (!installed) {
      sendProgress("downloading", `Baixando Proton ${game.protonVersion}...`);
      const toolId = extractToolId(game.protonVersion);
      if (toolId) {
        const release = await fetchRelease(toolId, game.protonVersion.replace(/^v/, ""));
        if (release) installed = await downloadTool({ toolId, release });
      }
    }

    if (installed) {
      await gamesStore.put(gameKey, { ...game, protonPath: installed });
      return installed;
    }

    sendProgress("error", `Falha ao baixar Proton ${game.protonVersion}`);
    return null;
  }

  const userPreferences = await db
    .get<string, UserPreferences | null>(storeKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);

  const defaultProtonPath = userPreferences?.defaultProtonPath;
  if (defaultProtonPath && Umu.isValidProtonPath(defaultProtonPath)) {
    sendProgress("checking", "Usando Proton padrão...");
    await gamesStore.put(gameKey, { ...game, protonPath: defaultProtonPath });
    return defaultProtonPath;
  }

  sendProgress("error", "Proton não configurado");
  return null;
}

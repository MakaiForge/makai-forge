import { registerEvent } from "@main/events/register-event";
import { gamesStore, storeKeys } from "@main/store";
import { ProtonRecommendationService, logger, Wine } from "@main/services";
import type { GameShop } from "@types";

const checkGameDlls = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
): Promise<{ installed: string[]; errors: string[] }> => {
  const gameKey = storeKeys.game(shop, objectId);
  const game = await gamesStore.get(gameKey);

  if (!game) {
    return { installed: [], errors: ["Game not found"] };
  }

  const winePrefixPath = Wine.getEffectivePrefixPath(
    game.winePrefixPath,
    objectId
  );

  if (!winePrefixPath) {
    return { installed: [], errors: ["No Wine prefix configured"] };
  }

  const protonPath = game.protonPath;
  if (!protonPath) {
    return { installed: [], errors: ["No Proton path configured"] };
  }

  try {
    const result = await ProtonRecommendationService.installGameDlls(
      objectId,
      winePrefixPath,
      protonPath
    );
    logger.log(`[checkGameDlls] Result for ${objectId}:`, result);
    return result;
  } catch (err) {
    logger.error("[checkGameDlls] Error:", err);
    return { installed: [], errors: [String(err)] };
  }
};

registerEvent("checkGameDlls", checkGameDlls);

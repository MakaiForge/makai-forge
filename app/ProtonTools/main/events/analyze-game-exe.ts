import { registerEvent } from "@main/events/register-event";
import { ProtonRecommendationService } from "@provision/proton_recommended/services/proton-recommendation";
import { logger } from "@main/services/logger";

const analyzeGameExe = async (
  _event: Electron.IpcMainInvokeEvent,
  exePath: string
) => {
  try {
    const result = await ProtonRecommendationService.analyzeExe(exePath);
    return result;
  } catch (error) {
    logger.error("analyzeGameExe failed", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao analisar EXE",
    };
  }
};

registerEvent("analyzeGameExe", analyzeGameExe);

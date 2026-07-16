import { registerEvent } from "@main/events/register-event";
import { ProtonRecommendationService } from "@provision/proton_recommended/services/proton-recommendation";

const recommendProton = async (
  _event: Electron.IpcMainInvokeEvent,
  gameId: string
) => {
  try {
    const recommendation = await ProtonRecommendationService.recommend(gameId);
    return recommendation;
  } catch (error) {
    return null;
  }
};

registerEvent("recommendProton", recommendProton);

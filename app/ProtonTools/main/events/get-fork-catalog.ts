import { registerEvent } from "@main/events/register-event";
import { ProtonRecommendationService } from "@provision/proton_recommended/services/proton-recommendation";

const getForkCatalog = async () => {
  try {
    return await ProtonRecommendationService.getInstalledForks();
  } catch {
    return [];
  }
};

registerEvent("getForkCatalog", getForkCatalog);

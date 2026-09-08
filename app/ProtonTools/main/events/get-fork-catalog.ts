import { registerEvent } from "@main/events/register-event";
import { ProtonRecommendationService } from "@provision/proton_recommended/services/proton-recommendation";
import { getForkCatalogFromDb } from "@proton/main/services/db";

/**
 * Retorna o catálogo completo de forks/versões (fork_catalog.db — 30 forks,
 * ~1.700 releases). Lê direto do SQLite no processo main; se o DB não estiver
 * disponível, cai para o RPC Python (list_available_forks).
 */
const getForkCatalog = async () => {
  try {
    const fromDb = getForkCatalogFromDb();
    if (fromDb.length > 0) return fromDb;
  } catch {
    /* fallback abaixo */
  }

  try {
    return await ProtonRecommendationService.getInstalledForks();
  } catch {
    return [];
  }
};

registerEvent("getForkCatalog", getForkCatalog);

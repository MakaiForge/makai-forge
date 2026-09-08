import { registerEvent } from "@main/events/register-event";
import { logger } from "@main/services/logger";
import {
  getSystemSpecs,
  getStoredSystemSpecs,
  collectSystemSpecs,
  checkCompatibility,
  type SystemSpecs,
  type CompatibilityResult,
} from "./system-specs";

/**
 * IPC de especificações do sistema e compatibilidade de jogos.
 * - getSystemSpecs: retorna as specs salvas (coletando na primeira execução).
 * - checkGameCompatibility: compara o hardware do usuário com os requisitos
 *   mínimo/recomendado do jogo (do catálogo) e devolve um veredito.
 */

registerEvent("getSystemSpecs", (): SystemSpecs => {
  return getSystemSpecs();
});

registerEvent("getStoredSystemSpecs", (): SystemSpecs | null => {
  return getStoredSystemSpecs();
});

registerEvent("refreshSystemSpecs", (): SystemSpecs => {
  logger.info("[SystemSpecs] Coleta forçada solicitada pelo usuário");
  return collectSystemSpecs();
});

registerEvent(
  "checkGameCompatibility",
  (_event, minimum: string | null | undefined, recommended: string | null | undefined): CompatibilityResult => {
    const specs = getSystemSpecs();
    return checkCompatibility(specs, minimum, recommended);
  },
);

registerEvent(
  "checkGameCompatibilityWithSpecs",
  (_event, specs: SystemSpecs, minimum: string | null | undefined, recommended: string | null | undefined): CompatibilityResult => {
    return checkCompatibility(specs, minimum, recommended);
  },
);

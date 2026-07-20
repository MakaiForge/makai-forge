import { getGameModule } from "@games/registry";
import { ensureFrameworks, isFrameworkInstalled } from "@mods/services/framework-installer";
import type { FrameworkDef } from "@games/_shared/types";
import type { SendProgress } from "../types";

export interface FrameworksResult {
  installed: string[]
  skipped: string[]
  failed: string[]
}

/**
 * Step 5: Ensure all required frameworks are installed for the game.
 * For non-Bethesda games, this downloads BepInEx, SMAPI, CET, etc.
 */
export async function ensureGameFrameworks(
  gameId: string,
  gamePath: string,
  send: SendProgress,
): Promise<FrameworksResult> {
  const mod = getGameModule(gameId, gamePath);
  const frameworks = mod?.getAutoInstallFrameworks?.();

  if (!frameworks || frameworks.length === 0) {
    send("frameworks", "⏭️ Nenhum framework adicional necessário", "done");
    return { installed: [], skipped: [], failed: [] };
  }

  // Check which ones are already installed
  const missing = frameworks.filter(fw => !isFrameworkInstalled(gamePath, fw));
  if (missing.length === 0) {
    const names = frameworks.map(f => f.name).join(", ");
    send("frameworks", `✅ Todos os frameworks já instalados: ${names}`, "done");
    return {
      installed: [],
      skipped: frameworks.map(f => f.name),
      failed: [],
    };
  }

  // Install missing frameworks
  const result = await ensureFrameworks(gamePath, frameworks, (step, msg, type) => {
    send(step, msg, type);
  });

  const summary = [];
  if (result.installed.length > 0) summary.push(`Instalados: ${result.installed.join(", ")}`);
  if (result.skipped.length > 0) summary.push(`Já existentes: ${result.skipped.join(", ")}`);
  if (result.failed.length > 0) summary.push(`Falharam: ${result.failed.join(", ")}`);

  send("frameworks", summary.join(" | "), result.failed.length > 0 ? "error" : "done");

  return result;
}

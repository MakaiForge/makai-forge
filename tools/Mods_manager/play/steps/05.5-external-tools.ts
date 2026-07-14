import { getGameModule } from "@games/registry";
import { ensureExternalTools, isToolInstalled } from "@mods/services/external-tool-installer";
import type { SendProgress } from "../types";

export interface ExternalToolsResult {
  installed: string[]
  skipped: string[]
  failed: string[]
}

/**
 * Step 5.5: Ensure external tools with downloadUrl are installed.
 * Only downloads tools that have a downloadUrl defined in the game module.
 */
export async function ensureGameExternalTools(
  gameId: string,
  gamePath: string,
  send: SendProgress,
): Promise<ExternalToolsResult> {
  const mod = getGameModule(gameId, gamePath);
  const tools = mod?.getExternalTools?.() || [];

  const downloadable = tools.filter(t => t.downloadUrl);
  if (downloadable.length === 0) {
    send("tools", "⏭️ Nenhuma tool com download disponível", "done");
    return { installed: [], skipped: [], failed: [] };
  }

  const missing = downloadable.filter(t => !isToolInstalled(gameId, t));
  if (missing.length === 0) {
    const names = downloadable.map(t => t.name).join(", ");
    send("tools", `✅ Todas as tools já instaladas: ${names}`, "done");
    return {
      installed: [],
      skipped: downloadable.map(t => t.name),
      failed: [],
    };
  }

  const result = await ensureExternalTools(gameId, downloadable, (step, msg, type) => {
    send(step, msg, type);
  });

  const summary = [];
  if (result.installed.length > 0) summary.push(`Instaladas: ${result.installed.join(", ")}`);
  if (result.skipped.length > 0) summary.push(`Já existentes: ${result.skipped.join(", ")}`);
  if (result.failed.length > 0) summary.push(`Falharam: ${result.failed.join(", ")}`);

  send("tools", summary.join(" | "), result.failed.length > 0 ? "error" : "done");

  return result;
}

import type { GameShop } from "@types";
import { WindowManager } from "@main/services";
import { MakaiRPC } from "@mods-manager/services/makai-rpc";
import { setupPrefix, resolveActualPrefix } from "@provision/ForgePipeline/orchestrator/prefix-setup";
import { ProtonRecommendationService } from "@provision/proton_recommended/services/proton-recommendation";
import { sendProgress } from "./send-progress";
import path from "node:path";
import fs from "node:fs";

export function showExecutableSelect(
  candidates: { path: string; name: string; size: number }[],
  suggestedDir: string | null,
  prefixDriveCPath: string,
  gameTitle: string,
  gameKey: string,
  shop: GameShop,
  objectId: string
) {
  WindowManager.createExecutableSelectWindow({
    shop,
    objectId,
    candidates,
    suggestedDir,
    prefixDriveCPath,
    gameTitle,
    gameKey,
  });
  WindowManager.showExecutableSelectWindow();
}

export async function handleExistingPrefix(
  winePrefixPath: string,
  shop: GameShop,
  objectId: string,
  gameTitle: string,
  gameKey: string
): Promise<boolean> {
  sendProgress("installing", "Prefixo encontrado. Procurando executáveis...");
  let candidates: { path: string; name: string; size: number }[] = [];
  let suggestedDir: string | null = null;

  try {
    const result = await MakaiRPC.call<{
      candidates: { path: string; name: string; size: number }[];
      suggested_dir: string | null;
    }>("scan_prefix_for_exes", { prefix_path: winePrefixPath });
    candidates = result.candidates ?? [];
    suggestedDir = result.suggested_dir;
  } catch {
    sendProgress("error", "Falha ao escanear prefixo");
    return false;
  }

  WindowManager.closeGameLauncherWindow();

  if (candidates.length > 0) {
    showExecutableSelect(
      candidates,
      suggestedDir,
      path.join(resolveActualPrefix(winePrefixPath), "drive_c"),
      gameTitle,
      gameKey,
      shop,
      objectId
    );
  } else {
    sendProgress("error", "Nenhum executável encontrado no prefixo. Selecione o instalador manualmente.");
  }
  return true;
}

export async function createPrefixWithDlls(
  objectId: string,
  protonPath: string,
  winePrefixPath: string
): Promise<boolean> {
  sendProgress("installing", "Criando novo prefixo Wine...");
  const ok = await setupPrefix(objectId, protonPath, winePrefixPath, (msg) =>
    sendProgress("installing", msg)
  );
  if (!ok) {
    sendProgress("error", "Falha ao criar prefixo Wine");
    return false;
  }
  try {
    await ProtonRecommendationService.installGameDlls(objectId, winePrefixPath, protonPath);
  } catch {
    /* non-critical */
  }
  return true;
}

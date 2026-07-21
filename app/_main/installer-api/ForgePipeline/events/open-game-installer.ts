import { shell } from "electron";
import path from "node:path";
import fs from "node:fs";

import { getDownloadsPath } from "@main/events/helpers/get-downloads-path";
import { registerEvent } from "@main/events/register-event";
import { downloadsStore, gamesStore, storeKeys } from "@main/store";
import { GameShop } from "@types";
import { Wine, WindowManager } from "@main/services";
import { setupPrefix, resolveActualPrefix } from "../orchestrator/prefix-setup";
import { ProtonRecommendationService } from "@provision/proton_recommended/services/proton-recommendation";
import { ensureWinetricks } from "@provision/ensure-Makaitricks";
import { debugLog } from "@provision/debug-log";
import type { InstallResult } from "../orchestrator/types";
import { installGame } from "@game-launcher/install/install-game";

async function findGameFolder(gameTitle: string | null): Promise<string | null> {
  const dlPath = await getDownloadsPath();
  if (!fs.existsSync(dlPath)) return null;
  const entries = fs.readdirSync(dlPath, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const name = e.name.toLowerCase();
    const title = (gameTitle ?? "").toLowerCase();
    if (title && (name.includes(title) || title.includes(name))) {
      return path.join(dlPath, e.name);
    }
  }
  return null;
}

function returnOrSelect(
  shop: GameShop,
  objectId: string,
  candidates: { path: string; name: string; size: number }[],
  suggestedDir: string | null,
  gameTitle: string,
  gameKey: string,
  prefixDriveCPath: string,
  existingExePath?: string
): InstallResult {
  if (existingExePath && candidates.length > 0) {
    const targetName = path.basename(existingExePath).toLowerCase();
    const matched = candidates.find(c => c.name.toLowerCase() === targetName);
    if (matched) {
      return { wasOpened: true, candidates: [], suggestedDir: null, autoSetExe: matched.path };
    }
  }
  if (candidates.length > 0) {
    WindowManager.createExecutableSelectWindow({
      shop, objectId,
      candidates,
      suggestedDir, prefixDriveCPath, gameTitle, gameKey,
    });
    WindowManager.showExecutableSelectWindow();
    return { wasOpened: true, candidates: [], suggestedDir: null, executableSelectWindowOpened: true };
  }
  return { wasOpened: true, candidates: [], suggestedDir };
}

export const openGameInstaller = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  protonPath?: string | null,
  gameTitle?: string | null,
  folderName?: string | null
): Promise<InstallResult> => {
  const downloadKey = storeKeys.game(shop, objectId);
  const download = folderName
    ? { folderName }
    : await downloadsStore.get(downloadKey).catch(() => null);
  const game = await gamesStore.get(downloadKey).catch(() => null);

  const effectiveProtonPath = protonPath || null;
  const effectiveGameTitle = gameTitle || game?.title || null;
  const effectiveWinePrefixPath = Wine.getEffectivePrefixPath(null, objectId, effectiveGameTitle);

  debugLog.log("open_game_installer_start", {
    shop, objectId, gameTitle: effectiveGameTitle,
    protonPath: effectiveProtonPath, winePrefixPath: effectiveWinePrefixPath,
    folderName: download?.folderName, gameFromStore: !!game,
    installConfig: game?.installConfig,
  });

  if (objectId && effectiveProtonPath && effectiveWinePrefixPath) {
    await setupPrefix(objectId, effectiveProtonPath, effectiveWinePrefixPath);
  }

  const resolvedPrefix = effectiveWinePrefixPath ? resolveActualPrefix(effectiveWinePrefixPath) : null;

  if (objectId && effectiveProtonPath && game && !game.protonPath) {
    game.protonPath = effectiveProtonPath;
    game.protonVersion = path.basename(effectiveProtonPath);
    await gamesStore.put(downloadKey, game).catch(() => {});
  }

  let gamePath: string | null = null;

  if (download?.folderName) {
    gamePath = path.join(download.downloadPath ?? (await getDownloadsPath()), download.folderName);
  } else if (effectiveGameTitle) {
    gamePath = await findGameFolder(effectiveGameTitle);
  }

  debugLog.log("open_game_installer_game_path", { gamePath, exists: gamePath ? fs.existsSync(gamePath) : false });

  if (!gamePath || !fs.existsSync(gamePath)) {
    const suggestedDir = effectiveWinePrefixPath || (effectiveGameTitle ? Wine.getProtonForgerPrefixPath(effectiveGameTitle) : null);
    return { wasOpened: true, candidates: [], suggestedDir };
  }

  const scriptVerbs: string[] = [
    ...(game?.installConfig?.winetricks || []),
    ...((game as any)?.gameDlls || []),
  ];

  const prefixDriveCPath = resolvedPrefix ? path.join(resolvedPrefix, "drive_c") : "";
  const existingExePath = game?.executablePath || "";

  // Se arquivo único .exe/.msi → instalar via Makai Time
  if (fs.lstatSync(gamePath).isFile()) {
    const ext = path.extname(gamePath).toLowerCase();
    if (ext === ".exe" || ext === ".msi") {
      if (scriptVerbs.length > 0 && resolvedPrefix) {
        try {
          const wtPath = await ensureWinetricks();
          await ProtonRecommendationService.installGameDlls(objectId, resolvedPrefix, effectiveProtonPath!, scriptVerbs, wtPath);
        } catch { /* DLLs não críticas */ }
      }
      const result = await installGame(gamePath, {
        prefixPath: effectiveWinePrefixPath!,
        protonPath: effectiveProtonPath!,
        gameId: objectId,
        existingExePath,
      });
      return returnOrSelect(shop, objectId, result.candidates, result.suggested_dir,
        effectiveGameTitle || "", downloadKey, prefixDriveCPath, existingExePath);
    }
    shell.showItemInFolder(gamePath);
    return { wasOpened: true, candidates: [], suggestedDir: null };
  }

  // ─── PASTA ───────────────────────────────────────

  // Instalar DLLs se necessário
  if (scriptVerbs.length > 0 && resolvedPrefix) {
    try {
      const wtPath = await ensureWinetricks();
      await ProtonRecommendationService.installGameDlls(objectId, resolvedPrefix, effectiveProtonPath!, scriptVerbs, wtPath);
    } catch { /* DLLs não críticas */ }
  }

  // Chamada direta ao TypeScript: cobre installer, portable, extract_only
  const result = await installGame(gamePath, {
    prefixPath: effectiveWinePrefixPath!,
    protonPath: effectiveProtonPath!,
    gameId: objectId,
    existingExePath,
  });

  if (result.candidates.length > 0) {
    return returnOrSelect(shop, objectId, result.candidates, result.suggested_dir,
      effectiveGameTitle || "", downloadKey, prefixDriveCPath, existingExePath);
  }

  // Fallback: escaneia pasta original
  const { findExesInFolder } = await import("@main/helpers/find-exe-in-folder");
  const folderExes = findExesInFolder(gamePath);
  if (folderExes.candidates.length > 0) {
    return returnOrSelect(shop, objectId, folderExes.candidates, folderExes.suggestedDir,
      effectiveGameTitle || "", downloadKey, prefixDriveCPath, existingExePath);
  }

  return { wasOpened: true, candidates: [], suggestedDir: gamePath };
};

registerEvent("openGameInstaller", openGameInstaller);

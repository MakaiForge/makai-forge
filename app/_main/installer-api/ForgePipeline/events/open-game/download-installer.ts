import type { Game, Download } from "@types";
import { Downloader } from "@shared";
import { downloadsStore, storeKeys } from "@main/store";
import { WindowManager, logger, DownloadManager } from "@main/services";
import { getDownloadsPath } from "@main/events/helpers/get-downloads-path";
import { sendProgress } from "./send-progress";
import path from "node:path";
import fs from "node:fs";
import { dialog } from "electron";

/**
 * Baixa/resolve o instalador do catálogo e retorna:
 *   sourcePath  — caminho do .exe instalador OU da pasta extraída
 *   isInstaller — true se for .exe para executar, false se for pasta (portátil)
 */
export async function downloadFromCatalog(
  game: Game,
  gameKey: string,
  shop: string,
  objectId: string
): Promise<{ sourcePath: string; isInstaller: boolean } | null> {
  const downloadPath = await getDownloadsPath();

  const downloadEntry: Download = {
    shop: shop as any,
    objectId,
    uri: game.downloadUrl!,
    folderName: null,
    downloadPath,
    progress: 0,
    downloader: game.downloader ?? Downloader.Direct,
    bytesDownloaded: 0,
    fileSize: null,
    shouldSeed: false,
    status: "active",
    queued: false,
    timestamp: Date.now(),
    extracting: true,
    automaticallyExtract: true,
    automaticallyDeleteArchiveFiles: false,
  };

  await downloadsStore.put(gameKey, downloadEntry);
  await DownloadManager.startDownload(downloadEntry);

  // ─── Aguarda o download completar ───
  while (true) {
    await new Promise((r) => setTimeout(r, 2000));
    const current = await downloadsStore.get(gameKey);
    if (!current) break;
    logger.log(`[REPAIR] ${gameKey} status=${current.status} extracting=${current.extracting} progress=${current.progress}`);
    if ((current.status === "complete" || current.status === "seeding") && !current.extracting) break;
    if (current.status === "error") {
      sendProgress("error", "Falha ao baixar instalador");
      return null;
    }
  }

  // ─── Após download, o sistema já atualizou folderName ───
  const current = await downloadsStore.get(gameKey).catch(() => null);
  if (!current?.folderName) return null;

  const resolvedPath = path.join(current.downloadPath, current.folderName);
  if (!fs.existsSync(resolvedPath)) return null;

  const isDir = fs.statSync(resolvedPath).isDirectory();

  if (isDir) {
    // Pasta extraída → procurar .exe installer dentro
    const INSTALLER_PATTERNS = [/setup/i, /install/i, /msi/i];
    const scan = (dir: string, depth: number): string | null => {
      if (depth > 2) return null;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const fullPath = path.join(dir, e.name);
          if (e.isDirectory()) { const f = scan(fullPath, depth + 1); if (f) return f; }
          else if (e.isFile() && e.name.toLowerCase().endsWith(".exe") && INSTALLER_PATTERNS.some((p) => p.test(e.name))) return fullPath;
        }
      } catch { /* skip */ }
      return null;
    };
    const installerExe = scan(resolvedPath, 0);
    if (installerExe) return { sourcePath: installerExe, isInstaller: true };
    return { sourcePath: resolvedPath, isInstaller: false };
  }

  // Aquivo único (.exe) → usar direto
  return { sourcePath: resolvedPath, isInstaller: true };
}

export async function promptManualInstaller(): Promise<string | null> {
  sendProgress("checking", "Selecione o instalador...");
  const result = await dialog.showOpenDialog({
    title: "Selecione o instalador",
    filters: [{ name: "Executaveis", extensions: ["exe", "msi"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) {
    sendProgress("error", "Cancelado");
    return null;
  }
  return result.filePaths[0];
}

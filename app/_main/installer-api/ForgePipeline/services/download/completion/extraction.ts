import type { Download, Game } from "@types";
import { FILE_EXTENSIONS_TO_EXTRACT } from "@shared";
import { GameFilesManager } from "@provision/ForgePipeline/services/game-files-manager";
import path from "node:path";
import fs from "node:fs";
import { logger } from "@main/services/logger";

export async function handleExtraction(
  download: Download,
  game: Game
): Promise<void> {
  const gameFilesManager = new GameFilesManager(game.shop, game.objectId);
  const extractionPath = download.folderName
    ? path.join(download.downloadPath, download.folderName)
    : null;

  if (!extractionPath || !fs.existsSync(extractionPath)) {
    await gameFilesManager
      .failExtraction(new Error("No downloaded archive was found to extract"))
      .catch((error) =>
        logger.error(
          "[DownloadManager] Failed to persist extraction failure state",
          error
        )
      );
    return;
  }

  const extractionStats = fs.statSync(extractionPath);

  const INSTALLER_EXTS = [".exe", ".msi", ".bin", ".run", ".sh"];

  if (
    extractionStats.isFile() &&
    FILE_EXTENSIONS_TO_EXTRACT.some((ext) =>
      download.folderName?.toLowerCase().endsWith(ext)
    )
  ) {
    await gameFilesManager.extractDownloadedFile().catch((error) => {
      logger.error(
        "[DownloadManager] Failed to extract downloaded file",
        error
      );
      return gameFilesManager.failExtraction(error).catch((failError) => {
        logger.error(
          "[DownloadManager] Failed to persist extraction failure state",
          failError
        );
      });
    });
  } else if (
    extractionStats.isFile() &&
    INSTALLER_EXTS.some((ext) =>
      download.folderName?.toLowerCase().endsWith(ext)
    )
  ) {
    logger.info(
      `[DownloadManager] Single installer file detected, skipping extraction: "${download.folderName}"`
    );
    await gameFilesManager.setExtractionComplete();
  } else if (extractionStats.isDirectory()) {
    await gameFilesManager
      .extractFilesInDirectory(extractionPath)
      .then(async (success) => {
        if (success) await gameFilesManager.setExtractionComplete();
      })
      .catch((error) => {
        logger.error(
          "[DownloadManager] Failed to extract files in directory",
          error
        );
        return gameFilesManager.failExtraction(error).catch((failError) => {
          logger.error(
            "[DownloadManager] Failed to persist extraction failure state",
            failError
          );
        });
      });
  } else {
    await gameFilesManager
      .failExtraction(
        new Error(
          `Invalid extraction source type for "${download.folderName ?? "unknown"}"`
        )
      )
      .catch((error) =>
        logger.error(
          "[DownloadManager] Failed to persist extraction failure state",
          error
        )
      );
  }
}

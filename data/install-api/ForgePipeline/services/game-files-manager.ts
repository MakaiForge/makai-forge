import { getDirectorySize } from "@main/events/helpers/get-directory-size";
import { db, downloadsStore, gamesStore, storeKeys } from "@main/store";
import { Downloader, FILE_EXTENSIONS_TO_EXTRACT } from "@shared";
import type { GameShop, UserPreferences } from "@types";
import fs from "node:fs";
import path from "node:path";
import { ExtractionProgress, SevenZip } from "@main/services/7zip";
import { getPathType } from "@main/services/extraction-path";
import { GameExecutables } from "@games-ui/services/game-executables";
import { logger } from "@main/services/logger";
import { deleteArchiveFile } from "@games-ui/events/library/delete-archive";
import { publishExtractionCompleteNotification } from "@main/services/notifications";
import { WindowManager } from "@main/services/window-manager";

const PROGRESS_THROTTLE_MS = 1000;

export class GameFilesManager {
  private lastProgressUpdateTime = 0;
  private lastProgressUpdateValue = 0;

  constructor(
    private readonly shop: GameShop,
    private readonly objectId: string
  ) {}

  private get gameKey() {
    return storeKeys.game(this.shop, this.objectId);
  }

  private updateExtractionProgress(progress: number, force = false) {
    const now = Date.now();

    if (!force && now - this.lastProgressUpdateTime < PROGRESS_THROTTLE_MS) {
      return;
    }

    if (!force && progress < this.lastProgressUpdateValue) {
      return;
    }

    this.lastProgressUpdateValue = progress;
    this.lastProgressUpdateTime = now;

    WindowManager.mainWindow?.webContents.send(
      "on-extraction-progress",
      this.shop,
      this.objectId,
      progress
    );
  }

  private async setExtractionFailedState(error: unknown, targetPath?: string) {
    logger.error(
      `[GameFilesManager] Extraction failed for ${this.objectId}${targetPath ? ` at ${targetPath}` : ""}`,
      error
    );

    const download = await downloadsStore.get(this.gameKey);

    if (download) {
      const status =
        download.progress === 1
          ? download.shouldSeed && download.downloader === Downloader.Torrent
            ? "seeding"
            : "complete"
          : download.status;

      await downloadsStore.put(this.gameKey, {
        ...download,
        status,
        queued: false,
        extracting: false,
      });
    }

    WindowManager.mainWindow?.webContents.send(
      "on-extraction-failed",
      this.shop,
      this.objectId
    );

    this.lastProgressUpdateTime = 0;
    this.lastProgressUpdateValue = 0;
  }

  async failExtraction(error: unknown, targetPath?: string) {
    await this.setExtractionFailedState(error, targetPath);
  }

  private readonly handleProgress = (progress: ExtractionProgress) => {
    console.log(`handleProgress: ${progress.percent}% - ${progress.file}`);
    this.updateExtractionProgress(progress.percent / 100);
  };

  async extractFilesInDirectory(directoryPath: string): Promise<boolean> {
    let pathType: Awaited<ReturnType<typeof getPathType>>;
    try {
      pathType = await getPathType(directoryPath);
    } catch (error) {
      await this.setExtractionFailedState(error, directoryPath);
      return false;
    }

    if (pathType !== "directory") {
      await this.setExtractionFailedState(
        new Error(
          `Expected extraction directory but got "${pathType}" for ${directoryPath}`
        ),
        directoryPath
      );
      return false;
    }

    let files: string[];
    try {
      files = await fs.promises.readdir(directoryPath);
    } catch (error) {
      await this.setExtractionFailedState(error, directoryPath);
      return false;
    }

    const compressedFiles = files.filter((file) =>
      FILE_EXTENSIONS_TO_EXTRACT.some((ext) => file.toLowerCase().endsWith(ext))
    );

    const filesToExtract = compressedFiles.filter(
      (file) => /part1\.rar$/i.test(file) || !/part\d+\.rar$/i.test(file)
    );

    if (filesToExtract.length === 0) return true;

    this.updateExtractionProgress(0, true);

    const totalFiles = filesToExtract.length;
    let completedFiles = 0;

    for (const file of filesToExtract) {
      try {
        const result = await SevenZip.extractFile(
          {
            filePath: path.join(directoryPath, file),
            cwd: directoryPath,
            passwords: ["online-fix.me", "steamrip.com"],
          },
          (progress) => {
            const overallProgress =
              (completedFiles + progress.percent / 100) / totalFiles;
            this.updateExtractionProgress(overallProgress);
          }
        );

        if (result.success) {
          completedFiles++;
          this.updateExtractionProgress(completedFiles / totalFiles, true);
        } else {
          await this.setExtractionFailedState(
            new Error(`7zip returned unsuccessful extraction for ${file}`),
            path.join(directoryPath, file)
          );
          return false;
        }
      } catch (err) {
        await this.setExtractionFailedState(
          err,
          path.join(directoryPath, file)
        );
        return false;
      }
    }

    const archivePaths = compressedFiles
      .map((file) => path.join(directoryPath, file))
      .filter((archivePath) => fs.existsSync(archivePath));

    if (archivePaths.length > 0) {
      const [download, userPreferences] = await Promise.all([
        downloadsStore.get(this.gameKey),
        db.get<string, UserPreferences>(storeKeys.userPreferences, {
          valueEncoding: "json",
        }).catch(() => null),
      ]);

      const shouldDelete =
        download?.automaticallyDeleteArchiveFiles ??
        userPreferences?.deleteArchiveFilesAfterExtractionByDefault ??
        false;

      if (shouldDelete) {
        for (const archivePath of archivePaths) {
          await deleteArchiveFile(archivePath);
        }
      } else {
        WindowManager.mainWindow?.webContents.send(
          "on-archive-deletion-prompt",
          archivePaths
        );
      }
    }

    return true;
  }

  async setExtractionComplete(publishNotification = true) {
    const [download, game] = await Promise.all([
      downloadsStore.get(this.gameKey),
      gamesStore.get(this.gameKey),
    ]);

    if (!download) return;

    await downloadsStore.put(this.gameKey, {
      ...download,
      extracting: false,
    });

    // Calculate and store the installed size
    if (game && download.folderName) {
      const gamePath = path.join(download.downloadPath, download.folderName);
      const installedSizeInBytes = await getDirectorySize(gamePath);

      await gamesStore.put(this.gameKey, {
        ...game,
        installedSizeInBytes,
      });
    }

    WindowManager.mainWindow?.webContents.send(
      "on-extraction-complete",
      this.shop,
      this.objectId
    );

    if (publishNotification && game) {
      publishExtractionCompleteNotification(game);
    }

    this.lastProgressUpdateTime = 0;
    this.lastProgressUpdateValue = 0;

    await this.searchAndBindExecutable();
  }

  async searchAndBindExecutable(): Promise<void> {
    try {
      const [download, game] = await Promise.all([
        downloadsStore.get(this.gameKey),
        gamesStore.get(this.gameKey),
      ]);

      if (!download || !game || game.executablePath) {
        return;
      }

      const executableNames = GameExecutables.getExecutablesForGame(
        this.objectId
      );

      if (!executableNames || executableNames.length === 0) {
        return;
      }

      if (!download.folderName) {
        return;
      }

      const gameFolderPath = path.join(
        download.downloadPath,
        download.folderName
      );

      if (!fs.existsSync(gameFolderPath)) {
        return;
      }

      const foundExePath = await this.findExecutableInFolder(
        gameFolderPath,
        executableNames
      );

      if (foundExePath) {
        logger.info(
          `[GameFilesManager] Auto-detected executable for ${this.objectId}: ${foundExePath}`
        );

        await gamesStore.put(this.gameKey, {
          ...game,
          executablePath: foundExePath,
        });

        WindowManager.mainWindow?.webContents.send("on-library-batch-complete");
      }
    } catch (err) {
      logger.error(
        `[GameFilesManager] Error searching for executable: ${this.objectId}`,
        err
      );
    }
  }

  private async findExecutableInFolder(
    folderPath: string,
    executableNames: string[]
  ): Promise<string | null> {
    const normalizedNames = new Set(
      executableNames.map((name) => name.toLowerCase())
    );

    try {
      const entries = await fs.promises.readdir(folderPath, {
        withFileTypes: true,
        recursive: true,
      });

      for (const entry of entries) {
        if (!entry.isFile()) continue;

        const fileName = entry.name.toLowerCase();

        if (normalizedNames.has(fileName)) {
          const parentPath =
            "parentPath" in entry
              ? entry.parentPath
              : (entry as unknown as { path?: string }).path || folderPath;

          return path.join(parentPath, entry.name);
        }
      }
    } catch {
      // Silently fail if folder cannot be read
    }

    return null;
  }

  async extractDownloadedFile() {
    const [download, game] = await Promise.all([
      downloadsStore.get(this.gameKey),
      gamesStore.get(this.gameKey),
    ]);

    if (!download || !game) return false;

    if (!download.folderName) {
      await this.setExtractionFailedState(
        new Error("No downloaded archive was found to extract")
      );
      return false;
    }

    const filePath = path.join(download.downloadPath, download.folderName);

    const extractionPath = path.join(
      download.downloadPath,
      path.parse(download.folderName!).name
    );

    this.updateExtractionProgress(0, true);

    try {
      const result = await SevenZip.extractFile(
        {
          filePath,
          outputPath: extractionPath,
          passwords: ["online-fix.me", "steamrip.com"],
        },
        this.handleProgress
      );

      if (result.success) {
        const extractedNestedArchives =
          await this.extractFilesInDirectory(extractionPath);

        if (!extractedNestedArchives) {
          return false;
        }

        if (fs.existsSync(extractionPath) && fs.existsSync(filePath)) {
          const userPreferences = await db.get<string, UserPreferences | null>(
            storeKeys.userPreferences,
            { valueEncoding: "json" }
          );

          const shouldDelete =
            download.automaticallyDeleteArchiveFiles ??
            userPreferences?.deleteArchiveFilesAfterExtractionByDefault ??
            false;

          if (shouldDelete) {
            await deleteArchiveFile(filePath);
          } else {
            WindowManager.mainWindow?.webContents.send(
              "on-archive-deletion-prompt",
              [filePath]
            );
          }
        }

        await downloadsStore.put(this.gameKey, {
          ...download,
          folderName: path.parse(download.folderName!).name,
        });

        await this.setExtractionComplete();
      } else {
        await this.setExtractionFailedState(
          new Error("7zip returned unsuccessful extraction"),
          filePath
        );
        return false;
      }
    } catch (err) {
      await this.setExtractionFailedState(err, filePath);
      return false;
    }

    return true;
  }
}

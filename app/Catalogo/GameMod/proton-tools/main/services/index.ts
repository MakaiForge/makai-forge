import { logger } from "@main/services/logger";
import { WindowManager } from "@main/services/window-manager";
import fs from "node:fs";
import path from "node:path";
import type {
  ProtonTool,
  ProtonRelease,
  InstalledTool,
  DownloadOptions,
} from "./types";
import * as tools from "./tools";
import * as downloader from "./downloader";
import * as extractor from "./extractor";
import * as installer from "./installer";
import { getReleasesByForkId } from "./db";

export { getInstallDir, getCategoryDir } from "./installer";

function sendProgress(
  toolId: string,
  version: string,
  percent: number,
  speed: string
) {
  if (WindowManager.mainWindow) {
    WindowManager.mainWindow.webContents.send("on-proton-download-progress", {
      toolId,
      version,
      percent,
      speed,
    });
  }
}

function log(line: string) {
  logger.info(line);
  WindowManager.mainWindow?.webContents.send("on-install-log", line);
}

export async function getTools(): Promise<ProtonTool[]> {
  return tools.getTools();
}

export async function getToolsByCategory(
  category: string
): Promise<ProtonTool[]> {
  return tools.getToolsByCategory(category);
}

export async function getInstalledTools(): Promise<InstalledTool[]> {
  return installer.getInstalledTools();
}

export async function getReleases(toolId: string): Promise<ProtonRelease[]> {
  return getReleasesByForkId(toolId);
}



function renameDirToExpected(actualPath: string, expectedPath: string): boolean {
  if (actualPath === expectedPath) return true;
  if (fs.existsSync(expectedPath)) return false;
  try {
    fs.renameSync(actualPath, expectedPath);
    return true;
  } catch {
    return false;
  }
}

// Fila de download serial para evitar concorrência
interface QueueItem {
  options: DownloadOptions;
  resolve: (result: string | null) => void;
  reject: (error: Error) => void;
}
const downloadQueue: QueueItem[] = [];
let isDownloading = false;

function processQueue() {
  if (isDownloading || downloadQueue.length === 0) return;
  isDownloading = true;
  const next = downloadQueue.shift()!;
  (async () => {
    try {
      const result = await downloadToolInternal(next.options);
      next.resolve(result);
    } catch (error) {
      next.reject(error as Error);
    } finally {
      isDownloading = false;
      processQueue();
    }
  })();
}

export async function downloadTool(options: DownloadOptions): Promise<string | null> {
  return new Promise<string | null>((resolve, reject) => {
    downloadQueue.push({ options, resolve, reject });
    processQueue();
  });
}

async function downloadToolInternal(options: DownloadOptions): Promise<string | null> {
  const { toolId, release, onProgress } = options;
  const tool = tools.getToolById(toolId);
  if (!tool) {
    log(`[downloadTool] toolId "${toolId}" não encontrado`);
    return null;
  }

  const categoryDir = installer.getCategoryDir(tool.category);
  const dirName = tools.formatDirName(tool, release.tag_name);
  const expectedPath = path.join(categoryDir, dirName);

  log(`[downloadTool] tool="${tool.id}" tag="${release.tag_name}"`);
  log(`[downloadTool] formatDirName retornou: "${dirName}"`);
  log(`[downloadTool] expectedPath: ${expectedPath}`);

  const protonBinary = path.join(expectedPath, "proton");
  let exists = fs.existsSync(protonBinary);
  log(`[downloadTool] ${expectedPath}/proton existe? ${exists}`);

  if (!exists) {
    const installed = installer.getInstalledTools();
    const already = installed.find(i => i.tool.id === toolId && (i.version.includes(release.tag_name) || release.tag_name.includes(i.version)));
    if (already) {
      log(`[downloadTool] Já instalado (detectado por getInstalledTools): ${already.path}`);
      return already.path;
    }
  }

  if (exists) {
    logger.info(`Tool ${dirName} already installed`);
    log(`[downloadTool] Já instalado, retornando ${expectedPath}`);
    return expectedPath;
  }

  const progressCallback = onProgress
    ? onProgress
    : (percent: number, speed: string) =>
        sendProgress(toolId, release.tag_name, percent, speed);

  // Fase 1: Download (0-60%)
  logger.info(`Downloading ${tool.title} ${release.tag_name}`);
  log(`[downloadTool] Iniciando download de ${tool.title} ${release.tag_name}`);

  const downloadResult = await downloader.downloadFile(
    tool,
    release,
    categoryDir,
    (percent, speed) => {
      progressCallback(Math.round(percent * 0.6), speed);
    }
  );

  if (!downloadResult.success || !downloadResult.filePath) {
    logger.error(`Download failed: ${downloadResult.error}`);
    log(`[downloadTool] Download FALHOU: ${downloadResult.error}`);
    return null;
  }
  log(`[downloadTool] Download OK: ${downloadResult.filePath}`);

  // Fase 2: Extração (60-80%)
  progressCallback(60, "extracting");
  const beforeTools = installer.getInstalledTools();

  const extractResult = await extractor.extractArchive(
    downloadResult.filePath,
    categoryDir,
    dirName
  );

  if (!extractResult.success) {
    logger.error(`Extraction failed: ${extractResult.error}`);
    log(`[downloadTool] Extração FALHOU: ${extractResult.error}`);
    return null;
  }

  log(`[downloadTool] Extração concluída. extractPath=${extractResult.extractPath}`);
  progressCallback(85, "verifying");

  const actualPath = extractResult.extractPath!;

  const afterTools = installer.getInstalledTools();
  const newTool = afterTools.find(t => !beforeTools.some(b => b.path === t.path));

  if (newTool) {
    log(`[downloadTool] ProtonTools identificou: ${newTool.path}`);
    if (newTool.path !== expectedPath) {
      progressCallback(90, "adjusting_dir");
      renameDirToExpected(newTool.path, expectedPath);
      log(`[downloadTool] Pasta renomeada para ${expectedPath}`);
    }
    progressCallback(100, "done");
    return expectedPath;
  }

  progressCallback(100, "done_warning");
  logger.error(`Installed tool directory "${actualPath}" does not contain a proton binary`);
  log(`[downloadTool] proton NAO ENCONTRADO em lugar nenhum. ABORTANDO.`);
  return null;
}

export function removeToolByPath(_toolId: string, toolPath: string): boolean {
  return installer.removeTool(toolPath);
}

logger.info("Proton service initialized");

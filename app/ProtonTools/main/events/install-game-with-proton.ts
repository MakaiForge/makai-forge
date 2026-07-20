import { registerEvent } from "@main/events/register-event";
import { getReleases, downloadTool } from "@proton/main/services/index";
import { findToolIdByForkName } from "@proton/main/services/tools";
import { WindowManager } from "@main/services/window-manager";
import { logger } from "@main/services";
import type { ProtonFork } from "@types";
import type { ProtonRelease } from "@proton/main/services/types";

function sendInstallProgress(status: string, percent: number, gameTitle?: string) {
  if (WindowManager.mainWindow) {
    WindowManager.mainWindow.webContents.send("on-install-progress", {
      status,
      percent,
      gameTitle,
    });
  }
}

function sendInstallLog(line: string) {
  if (WindowManager.mainWindow) {
    WindowManager.mainWindow.webContents.send("on-install-log", line);
  }
}

function normalizeProtonVersion(s: string): string {
  const matches = s.match(/\d+(?:\.\d+)*/g);
  return matches ? matches.join(".") : s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findReleaseByFork(
  releases: ProtonRelease[],
  fork: ProtonFork
): ProtonRelease | null {
  if (fork.version.toLowerCase() === "latest") {
    return releases[0];
  }
  const version = fork.version.toLowerCase().replace(/^v/, "").replace(/[-\s]/g, "");
  const versionNums = normalizeProtonVersion(fork.version);
  const match = releases.find((release) => {
    const tag = release.tag_name.toLowerCase().replace(/^v/, "").replace(/[-\s]/g, "");
    const tagNums = normalizeProtonVersion(release.tag_name);
    if (tag === version || tagNums === versionNums) return true;
    if (tag.endsWith(version) || tag.includes(version) || version.includes(tag)) return true;
    if (tagNums.includes(versionNums) || versionNums.includes(tagNums)) return true;
    return false;
  });
  if (match) return match;
  logger.warn(`[findReleaseByFork] versão "${fork.version}" (norm="${versionNums}") não encontrada entre ${releases.length} releases`);
  logger.warn(`[findReleaseByFork] tags disponíveis: ${releases.slice(0, 10).map(r => r.tag_name).join(", ")}`);
  return null;
}

function sendDownloadProgress(toolId: string, version: string, percent: number) {
  if (WindowManager.mainWindow) {
    WindowManager.mainWindow.webContents.send("on-proton-download-progress", {
      toolId,
      version,
      percent,
      speed: "",
    });
  }
}

const downloadProton = async (
  _event: Electron.IpcMainInvokeEvent,
  fork: ProtonFork
): Promise<string | null> => {
  try {
    logger.info(`[downloadProton] INICIO fork=${JSON.stringify(fork)}`);
    sendInstallLog(`Iniciando instalação de ${fork.name}...`);

    const toolId = findToolIdByForkName(fork);
    if (!toolId) {
      logger.error(`[downloadProton] Nenhum toolId encontrado para fork.name="${fork.name}"`);
      sendInstallProgress("error", 0);
      return null;
    }
    logger.info(`[downloadProton] toolId="${toolId}"`);

    const releases = await getReleases(toolId);
    if (!releases || releases.length === 0) {
      logger.error(`[downloadProton] Nenhum release para toolId="${toolId}"`);
      sendInstallProgress("error", 0);
      return null;
    }
    logger.info(`[downloadProton] releases obtidas: ${releases.length} releases, primeira tag="${releases[0].tag_name}"`);
    sendInstallLog(`${releases.length} versões disponíveis para ${fork.name}`);

    const release = findReleaseByFork(releases, fork);
    if (!release) {
      logger.error(`[downloadProton] Nenhum release corresponde fork.version="${fork.version}". Tags disponiveis: ${releases.map(r => r.tag_name).join(", ")}`);
      sendInstallProgress("error", 0);
      return null;
    }
    logger.info(`[downloadProton] release encontrada: tag="${release.tag_name}"`);
    sendInstallProgress("preparing", 5);
    sendInstallLog(`Baixando ${release.tag_name}...`);

    const toolPath = await downloadTool({ toolId, release, onProgress: (percent, _speed) => {
      sendDownloadProgress(toolId, release.tag_name, percent);
      let stage = "download";
      if (percent >= 60 && percent < 80) stage = "extraindo";
      else if (percent >= 80 && percent < 90) stage = "instalando";
      sendInstallProgress(stage, percent);
    } });
    if (!toolPath) {
      logger.error(`[downloadProton] downloadTool falhou para ${release.tag_name}`);
      sendInstallProgress("error", 0);
      return null;
    }

    sendInstallProgress("finalizando", 90);
    sendInstallLog(`Proton instalado em: ${toolPath}`);
    logger.info(`[downloadProton] SUCESSO path="${toolPath}"`);
    sendInstallProgress("ready", 100);
    return toolPath;
  } catch (error) {
    logger.error("[downloadProton] exception", error);
    sendInstallProgress("error", 0);
    return null;
  }
};

registerEvent("downloadProton", downloadProton);

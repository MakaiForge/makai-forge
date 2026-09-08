import { registerEvent } from "@main/events/register-event";
import { gamesStore, storeKeys } from "@main/store";
import { installGame } from "@game-launcher/install/install-game";
import { setupPrefix } from "@provision/ForgePipeline/orchestrator/prefix-setup";
import type { GameShop } from "@types";
import { app, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { downloadTool } from "@proton/main/services/index";
import { getInstalledTools } from "@proton/main/services/installer";
import { getTools } from "@proton/main/services/tools";
import type { ProtonRelease } from "@proton/main/services/types";
import { WindowManager } from "@main/services";
import { logger } from "@main/services/logger";

function sendLog(msg: string) {
  logger.info(`[repairGame] ${msg}`);
  WindowManager.mainWindow?.webContents.send("on-repair-log", msg);
  WindowManager.gameLauncherWindow?.webContents.send("on-repair-log", msg);
}

function findExactProton(version: string): string | null {
  const installed = getInstalledTools();
  const search = version.toLowerCase().replace(/^v/, "");
  for (const tool of installed) {
    const ver = tool.version.toLowerCase().replace(/^v/, "");
    if (ver === search) return tool.path;
  }
  return null;
}

function extractToolId(protonVersion: string): string | null {
  const tools = getTools();
  const ver = protonVersion.replace(/^v/, "");
  for (const tool of tools) {
    const fmt = tool.directoryNameFormat.replace("$version", "").toLowerCase();
    const verLower = ver.toLowerCase();
    if (verLower.startsWith(fmt) || verLower.includes(fmt)) {
      return tool.id;
    }
  }
  return null;
}

async function fetchReleaseByTag(toolId: string, tag: string): Promise<ProtonRelease | null> {
  const tools = getTools();
  const tool = tools.find((t) => t.id === toolId);
  if (!tool) return null;

  if (tool.type === "github" || tool.type === "forgejo") {
    const baseUrl = tool.endpoint.replace(/\/releases\/?$/, "");
    const url = `${baseUrl}/tags/${encodeURIComponent(tag)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return null;
      const data = await res.json();

      const assets = (data.assets || []).map((a: any) => ({
        name: a.name,
        browser_download_url: a.browser_download_url || a.url,
      }));

      return {
        tag_name: data.tag_name || tag,
        assets,
        html_url: data.html_url,
        published_at: data.published_at || data.created_at || "",
        tarball_url: data.tarball_url,
        zipball_url: data.zipball_url,
      };
    } catch (e) {
      logger.error(`[repairGame] Failed to fetch release ${toolId}@${tag}:`, e);
      return null;
    }
  }

  const allReleases = await (await fetch(tool.endpoint, { signal: AbortSignal.timeout(15000) })).json();
  const releases: ProtonRelease[] = Array.isArray(allReleases) ? allReleases : [];
  return releases.find((r) => r.tag_name === tag || r.tag_name === `v${tag}`) || null;
}

async function ensureExactProton(
  currentProtonPath: string | null | undefined,
  protonVersion: string | null | undefined
): Promise<{ protonPath: string; protonVersion: string } | null> {
  if (!protonVersion) return null;

  if (currentProtonPath) {
    const protonBinary = path.join(currentProtonPath, "proton");
    if (fs.existsSync(protonBinary)) {
      sendLog(`Proton ${protonVersion} já disponível`);
      return { protonPath: currentProtonPath, protonVersion };
    }
  }

  const exact = findExactProton(protonVersion);
  if (exact) {
    sendLog(`Proton ${protonVersion} encontrado no sistema`);
    return { protonPath: exact, protonVersion };
  }

  const toolId = extractToolId(protonVersion);
  if (!toolId) {
    sendLog(`Não foi possível identificar a origem do Proton ${protonVersion}`);
    return null;
  }

  const tagName = protonVersion.replace(/^v/, "");
  sendLog(`Buscando release do Proton ${protonVersion}...`);

  const release = await fetchReleaseByTag(toolId, tagName);
  if (!release) {
    sendLog(`Release ${tagName} não encontrada para download`);
    return null;
  }

  sendLog(`Baixando Proton ${protonVersion}... (isso pode levar alguns minutos)`);
  const result = await downloadTool({ toolId, release });
  if (result) {
    sendLog(`Proton ${protonVersion} baixado e extraído`);
    return { protonPath: result, protonVersion };
  }

  sendLog(`Falha ao baixar Proton ${protonVersion}`);
  return null;
}

export async function repairGame(
  shop: GameShop,
  objectId: string
): Promise<{
  success: boolean;
  error?: string;
  needsRepair?: boolean;
  executablePath?: string | null;
}> {
  const gameKey = storeKeys.game(shop, objectId);
  const game = await gamesStore.get(gameKey).catch(() => null);

  if (!game) {
    sendLog("Jogo não encontrado no banco de dados");
    return { success: false, error: "Jogo não encontrado" };
  }

  const exeExists = game.executablePath && fs.existsSync(game.executablePath);
  const protonExists = game.protonPath && fs.existsSync(path.join(game.protonPath, "proton"));
  const prefixExists = game.winePrefixPath && fs.existsSync(path.join(game.winePrefixPath, "drive_c"));

  if (exeExists && protonExists && prefixExists) {
    sendLog("Jogo já está íntegro, nenhum reparo necessário");
    return { success: true, needsRepair: false, executablePath: game.executablePath };
  }

  sendLog(`Iniciando restauração de "${game.title}"...`);
  if (!exeExists) sendLog("- Executável não encontrado");
  if (!protonExists) sendLog("- Proton não encontrado");
  if (!prefixExists) sendLog("- Prefixo Wine não encontrado");

  if (!game.winePrefixPath) {
    sendLog("Prefixo não configurado no jogo");
    return { success: false, error: "Prefixo não configurado" };
  }

  sendLog(`Verificando Proton ${game.protonVersion}...`);
  const resolved = await ensureExactProton(game.protonPath, game.protonVersion);
  if (!resolved) {
    sendLog(`Proton ${game.protonVersion} não encontrado e não foi possível baixar`);
    return { success: false, error: `Proton ${game.protonVersion} não encontrado e não foi possível baixar` };
  }

  sendLog(`Preparando prefixo Wine com ${resolved.protonVersion}...`);
  const prefixOk = await setupPrefix(
    objectId,
    resolved.protonPath,
    game.winePrefixPath,
    (msg: string) => sendLog(msg)
  );
  if (!prefixOk) {
    sendLog("Falha ao criar prefixo Wine");
    return { success: false, error: "Falha ao recriar prefixo" };
  }
  sendLog("Prefixo Wine criado com sucesso");

  if (resolved.protonPath !== game.protonPath) {
    await gamesStore.put(gameKey, {
      ...game,
      protonPath: resolved.protonPath,
    });
  }

  let installerPath: string | null = null;

  if (game.downloadSource === "catalog" && game.downloadUrl) {
    sendLog("Baixando instalador do jogo via catálogo...");
    const tempDir = path.join(app.getPath("temp"), "protonforge-repair");
    fs.mkdirSync(tempDir, { recursive: true });
    const fileName = path.basename(game.downloadUrl).split("?")[0] || "installer.exe";
    installerPath = path.join(tempDir, fileName);

    if (!fs.existsSync(installerPath)) {
      const res = await fetch(game.downloadUrl);
      if (!res.ok || !res.body) {
        sendLog("Falha ao baixar instalador");
        return { success: false, error: "Falha ao baixar instalador" };
      }
      const writer = createWriteStream(installerPath);
      await pipeline(res.body as any, writer);
      sendLog("Instalador baixado com sucesso");
    } else {
      sendLog("Instalador já existe no cache");
    }
  } else {
    sendLog("Selecione o instalador do jogo...");
    const result = await dialog.showOpenDialog({
      title: "Selecione o instalador do jogo",
      filters: [{ name: "Executáveis", extensions: ["exe", "msi"] }],
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) {
      sendLog("Instalador não selecionado pelo usuário");
      return { success: false, error: "Instalador não selecionado" };
    }
    installerPath = result.filePaths[0];
    sendLog(`Instalador selecionado: ${installerPath}`);
  }

  if (!installerPath || !fs.existsSync(installerPath)) {
    sendLog("Instalador não encontrado no disco");
    return { success: false, error: "Instalador não encontrado" };
  }

  sendLog("Instalando jogo...");
  const installResult = await installGame(installerPath, {
    prefixPath: game.winePrefixPath!,
    protonPath: resolved.protonPath,
    gameId: objectId,
    existingExePath: game.executablePath,
    onProgress: (step, _percent, message) => {
      sendLog(`[${step}] ${message}`);
    },
  });

  if (installResult.candidates.length > 0) {
    const chosen = installResult.candidates[0];
    const updated = await gamesStore.get(gameKey).catch(() => game);
    await gamesStore.put(gameKey, {
      ...updated,
      executablePath: chosen.path,
    });
    sendLog(`Jogo restaurado com sucesso! Executável: ${chosen.path}`);
    return { success: true, needsRepair: true, executablePath: chosen.path };
  }

  sendLog("Nenhum executável encontrado após instalação");
  return { success: true, needsRepair: true, executablePath: null };
}

const repairGameHandler = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => repairGame(shop, objectId);

registerEvent("repairGame", repairGameHandler);

import { registerEvent } from "../register-event";
import axios from "axios";
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { gamesStore, downloadsStore, storeKeys } from "@main/store";
import { addGameToLibrary } from "@games-ui/events/library/add-game-to-library";
import type { GameShop } from "@types";
import { Wine, logger } from "@main/services";
import { getDownloadsPath } from "@main/events/helpers/get-downloads-path";
import { openGameInstaller } from "@provision/ForgePipeline/events/open-game-installer";
import { parseScriptYaml } from "@provision/scripts-install/parser";
import { downloadFile } from "@provision/scripts-install/downloader";
import { detectArchiveMagic, extractArchive } from "@provision/scripts-install/extractor";
import type { ParsedScriptYaml } from "@provision/scripts-install/types";
import { debugLog } from "@provision/debug-log";
import { getReleases, downloadTool } from "@proton/main/services/index";
import { findToolIdByForkName } from "@proton/main/services/tools";
import type { ProtonRelease } from "@proton/main/services/types";

const SITE_URL = app.isPackaged
  ? "https://makai-forge.store"
  : "http://localhost:8788";

function findReleaseByVersion(releases: ProtonRelease[], version: string): ProtonRelease | undefined {
  if (!version || version.toLowerCase() === "latest") return releases[0];
  const search = version.toLowerCase().replace(/^v/, "");
  return releases.find((r) => {
    const tag = r.tag_name.toLowerCase().replace(/^v/, "");
    return tag === search || tag.endsWith(search) || tag.includes(search) || search.includes(tag);
  });
}

const installScript = async (
  _event: Electron.IpcMainInvokeEvent,
  scriptId: string
) => {
  try {
    // 1. Fetch script data from API
    const res = await axios.get(`${SITE_URL}/api/scripts/${scriptId}`);
    const script = res.data;
    if (!script || !script.game_id) {
      return { error: "Script inválido: sem game_id" };
    }

    // 2. Parse YAML config
    const yaml = parseScriptYaml(script.content || "");
    debugLog.log("install_script_parsed", {
      scriptId,
      gameId: script.game_id,
      proton: yaml.proton,
      install: yaml.install,
      config: yaml.config,
      winetricks: yaml.install.winetricks,
      installer: yaml.installer,
      files: yaml.files,
      env: yaml.env,
      wine_overrides: yaml.wine_overrides,
    });

    // 3. Determine game identity
    const gameId = script.game_id;
    const hasDownloadUrl = yaml.files?.[0]?.url != null;
    const isSteam = !hasDownloadUrl && (!!yaml.steam_app_id || script.shop === "steam");
    const shop: GameShop = isSteam ? "steam" : "custom";
    const objectId = isSteam ? (yaml.steam_app_id || gameId) : gameId;
    const title = script.game_title || script.title || "Game";

    // 4. Add game to library
    await addGameToLibrary(_event, shop, objectId, title);

    // 5. Update game entry with script config
    const gameKey = storeKeys.game(shop, objectId);
    let game = await gamesStore.get(gameKey).catch(() => null);

    if (game) {
      const updates: Record<string, any> = {};

      // Proton version from script
      if (yaml.proton?.version || yaml.proton?.fork) {
        updates.protonVersion = yaml.proton.version || null;
        updates.protonPath = null;
      }

      // Wine prefix path for non-Steam games
      if (!isSteam) {
        updates.winePrefixPath = Wine.getEffectivePrefixPath(
          null,
          objectId,
          title
        );
      }

      // Env vars from script
      if (Object.keys(yaml.env).length > 0) {
        updates.env = {
          ...(game.env || {}),
          ...yaml.env,
        };
      }

      // Config toggles (ALL fields)
      if (Object.keys(yaml.config).length > 0) {
        if (yaml.config.dxvk !== undefined) updates.dxvk = yaml.config.dxvk;
        if (yaml.config.esync !== undefined) updates.esync = yaml.config.esync;
        if (yaml.config.fsync !== undefined) updates.fsync = yaml.config.fsync;
        if (yaml.config.vkd3d !== undefined) updates.vkd3d = yaml.config.vkd3d;
        if (yaml.config.enable_eac !== undefined) updates.enableEac = yaml.config.enable_eac;
        if (yaml.config.enable_battleye !== undefined) updates.enableBattlEye = yaml.config.enable_battleye;
        if (yaml.config.ntsync !== undefined) updates.ntsync = yaml.config.ntsync;
        if (yaml.config.gamemode !== undefined) updates.autoRunGamemode = yaml.config.gamemode;
        if (yaml.config.mangohud !== undefined) updates.autoRunMangohud = yaml.config.mangohud;
        if (yaml.config.force_x11 !== undefined) updates.forceX11 = yaml.config.force_x11;
        if (yaml.config.dlls !== undefined && Array.isArray(yaml.config.dlls)) {
          updates.gameDlls = yaml.config.dlls as string[];
        }
      }

      // Wine DLL overrides
      if (Object.keys(yaml.wine_overrides).length > 0) {
        updates.wineOverrides = yaml.wine_overrides;
      }

      // Game fields
      if (yaml.game?.exe) updates.executablePath = yaml.game.exe;
      if (yaml.game?.args) updates.launchOptions = yaml.game.args;
      if (yaml.game?.prefix) updates.gamePrefix = yaml.game.prefix;
      if (yaml.game?.working_dir) updates.gameWorkingDir = yaml.game.working_dir;
      if (yaml.game?.arch) updates.gameArch = yaml.game.arch;

      // System exclude_processes
      if (yaml.exclude_processes) {
        updates.excludeProcesses = yaml.exclude_processes;
      }

      // Install config (what to disable during installer)
      if (yaml.install) {
        updates.installConfig = {
          dxvk: yaml.install.dxvk,
          vkd3d: yaml.install.vkd3d,
          esync: yaml.install.esync,
          fsync: yaml.install.fsync,
          env: Object.keys(yaml.install.env).length > 0 ? yaml.install.env : undefined,
          winetricks: yaml.install.winetricks.length > 0 ? yaml.install.winetricks : undefined,
        };
      }

      // Installer config (exe_name, extract_only)
      if (yaml.installer) {
        updates.installerConfig = {
          exe_name: yaml.installer.exe_name || undefined,
          extract_only: yaml.installer.extract_only === true ? true : undefined,
        };
      }

      // Script metadata
      if (script.title) updates.title = script.title;
      if (script.version) updates.scriptVersion = script.version;
      if (script.distro) updates.scriptDistro = script.distro;
      if (script.system_info) updates.scriptSystemInfo = script.system_info;
      if (script.install_tips) updates.scriptInstallTips = script.install_tips;
      updates.scriptId = script.id;

      Object.assign(game, updates);
      await gamesStore.put(gameKey, game);
    }

    // 6. Download + extract files
    const scriptUrl = yaml.files?.[0]?.url || null;
    const folderName = `script-${shop}-${objectId}`;

    if (!isSteam && scriptUrl) {
      try {
        const sendProgress = (status: string, percent: number) => {
          if (_event.sender && !_event.sender.isDestroyed()) {
            _event.sender.send("on-install-progress", { status, percent });
          }
        };

        // a. Download (usa scripts-install/downloader.ts)
        sendProgress("download", 0);
        const downloadPath = await getDownloadsPath();
        const destDir = path.join(downloadPath, folderName);
        fs.mkdirSync(destDir, { recursive: true });

        const progressCb = (status: string, detail?: string) => {
          if (status === "download") sendProgress("download", 0);
          else if (status === "download_progress") {
            const m = detail?.match(/(\d+)%/);
            sendProgress("download_progress", m ? parseInt(m[1], 10) : 0);
          } else if (status === "download_ok") sendProgress("download_ok", 100);
        };

        const { archivePath } = await downloadFile(scriptUrl, destDir, folderName, progressCb);

        // b. ZIP / 7z extraction (usa scripts-install/extractor.ts)
        const magicBytes = detectArchiveMagic(archivePath);
        if (magicBytes) {
          sendProgress("extracting", 30);
          await extractArchive(archivePath, destDir, magicBytes);
        }

        // c. Save download info
        try {
          await downloadsStore.put(storeKeys.game(shop, objectId), { folderName, downloadPath: destDir });
        } catch {
          logger.warn("[installScript] Failed to save download info to store");
        }

        sendProgress("download_ok", 100);
      } catch (pipelineError: any) {
        logger.error("[installScript] Pipeline error:", pipelineError);
        sendProgress("error", pipelineError?.message || "Erro no download");
      }
    }

    // 7. Ensure Proton is installed
    let protonPath: string | null = null;
    const hasProton = !!(yaml.proton?.version || yaml.proton?.fork);
    if (hasProton) {
      const protonFork = yaml.proton.fork || "proton-cachyos";
      const protonVersion = yaml.proton.version || "latest";

      _event.sender.send("on-install-log", `Verificando Proton: ${protonFork} ${protonVersion}`);

      const toolId = findToolIdByForkName({ fork: protonFork, name: protonFork });
      if (!toolId) {
        logger.error(`[installScript] toolId não encontrado para fork="${protonFork}"`);
        _event.sender.send("on-install-log", `[ERRO] Fork não reconhecido: ${protonFork}`);
        return { error: `Fork Proton não reconhecido: ${protonFork}`, shop, objectId, title };
      }

      const releases = await getReleases(toolId);
      if (!releases || releases.length === 0) {
        logger.error(`[installScript] Nenhuma release para toolId="${toolId}"`);
        return { error: `Nenhuma versão disponível para ${protonFork}`, shop, objectId, title };
      }

      const release = findReleaseByVersion(releases, protonVersion);
      if (!release) {
        logger.error(`[installScript] Nenhuma release para version="${protonVersion}"`);
        return { error: `Versão ${protonVersion} não encontrada para ${protonFork}`, shop, objectId, title };
      }

      _event.sender.send("on-install-log", `Baixando ${release.tag_name}...`);

      protonPath = await downloadTool({ toolId, release, onProgress: (percent: number) => {
        _event.sender.send("on-install-progress", { status: "download", percent: Math.round(percent * 0.7) });
      } });

      if (!protonPath) {
        logger.error(`[installScript] Falha ao baixar ${release.tag_name}`);
        return { error: `Falha ao baixar Proton ${release.tag_name}`, shop, objectId, title };
      }

      _event.sender.send("on-install-log", `Proton instalado em: ${protonPath}`);
    }

    // 8. Chama openGameInstaller diretamente (cria prefixo, instala DLLs, executa instalador)
    const installResult = await openGameInstaller(
      _event,
      shop,
      objectId,
      protonPath,
      title,
      folderName
    );

    return {
      ...(installResult || {}),
      shop,
      objectId,
      title,
    };
  } catch (error: any) {
    return {
      error: error?.message || "Falha ao instalar script",
    };
  }
};

registerEvent("installScript", installScript);

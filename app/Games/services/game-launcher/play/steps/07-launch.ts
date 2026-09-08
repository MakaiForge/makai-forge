import path from "node:path";
import fs from "node:fs";
import { getGameInfo, getGameModule } from "@games/registry";
import { logger } from "@main/services";
import { gamesStore } from "@main/store";
import { MakaiRPC } from "@mods-manager/services/makai-rpc";
import { launchGame as launchWithMakaiRunner } from "@game-launcher/launch/launch-game";
import type { PlayResult, SendProgress } from "../types";

/** Diretórios padrão do wine — ignorados no scan recursivo (case-insensitive:
 * no Linux o wine cria "windows" minúsculo, "Program Files", etc.). */
const WINE_SYSTEM_DIRS = new Set([
  "program files",
  "program files (x86)",
  "programdata",
  "windows",
  "users",
  "tmp",
  "dosdevices",
  "pfx",
  "documentation and settings",
]);

function isSystemDirName(name: string): boolean {
  return WINE_SYSTEM_DIRS.has(name.toLowerCase());
}

function pickExe(candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  return (
    candidates.find((c) => path.basename(c).toLowerCase() === "game.exe") ||
    candidates[0]
  );
}

/** Scan recursivo do drive_c (exe pode estar em subpastas aninhadas). */
function recursiveExeScan(root: string, maxDepth = 5): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      // Pula diretórios do sistema do wine em qualquer profundidade abaixo da
      // raiz do prefixo. Sem isso o scan pega exes do SISTEMA
      // (ex.: drive_c/windows/Microsoft.NET/.../aspnet_regiis.exe) e lança
      // o exe errado em vez do jogo.
      if (depth > 0 && entry.isDirectory() && isSystemDirName(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".exe")) {
        // Defesa extra: nunca devolver exe cujo caminho passa por diretório de
        // sistema (ex.: prefixo/drive_c/windows/...).
        const rel = path.relative(root, full).split(path.sep);
        if (rel.some((seg) => isSystemDirName(seg))) continue;
        found.push(full);
      }
    }
  };
  walk(root, 0);
  return found;
}

/**
 * Para jogos custom (módulo genérico sem getLaunchExe/preferredLaunchExe), o
 * executável escolhido pelo usuário fica no games store com a MESMA key do
 * gameId (`custom:<objectId>`). Prioridade: exe DENTRO do prefixo (store ou
 * scan) > exe salvo fora do prefixo (último recurso).
 */
async function findCustomGameExecutable(
  gameId: string,
  gamePath: string,
  prefixPath: string,
): Promise<string | null> {
  const folderExe = pickExe(
    (() => {
      const candidates: string[] = [];
      try {
        for (const entry of fs.readdirSync(gamePath, { withFileTypes: true })) {
          if (!entry.isFile()) continue;
          if (entry.name.toLowerCase().endsWith(".exe")) candidates.push(path.join(gamePath, entry.name));
        }
      } catch { /* ignore */ }
      return candidates;
    })(),
  );

  // Scan recursivo do prefixo: exe aninhado (ex.: drive_c/Jogo/Sub/Jogo/Game.exe)
  const prefixExes = prefixPath ? recursiveExeScan(prefixPath) : [];
  const prefixExe = pickExe(prefixExes);

  try {
    const stored = await gamesStore.get(gameId).catch(() => null);
    const exe = stored?.executablePath;
    if (typeof exe === "string" && exe && fs.existsSync(exe)) {
      const insidePrefix =
        !!prefixPath &&
        path.resolve(exe).startsWith(path.resolve(prefixPath) + path.sep);
      // exe dentro do prefixo é sempre o certo; exe fora do prefixo (Downloads)
      // só se o prefixo não tiver executável nenhum.
      if (insidePrefix || !prefixExe) return exe;
    }
  } catch { /* ignore */ }

  return folderExe || prefixExe;
}

export function killGameProcess(): boolean {
  MakaiRPC.call("kill_game", {}).catch((err: unknown) => {
    logger.warn(`[Launch] killGameProcess RPC error: ${err}`);
  });
  return true;
}

function buildLaunchEnv(
  steamAppId: string | undefined,
  gamePath: string,
  compatDataPath: string,
  protonPath: string,
): Record<string, string> {
  const env: Record<string, string> = { PROTONPATH: protonPath };
  if (compatDataPath) {
    if (path.basename(compatDataPath) === "pfx") {
      // Layout compatdata (Steam): STEAM_COMPAT_DATA_PATH = <compatdata>, prefixo em <compatdata>/pfx
      env.STEAM_COMPAT_DATA_PATH = path.dirname(compatDataPath);
    } else if (compatDataPath.includes(path.sep + "compatdata" + path.sep)) {
      // compatdata sem subpasta pfx — o próprio dir é o prefixo
      env.STEAM_COMPAT_DATA_PATH = compatDataPath;
    }
    // Prefixo custom (pasta única): NÃO definir STEAM_COMPAT_DATA_PATH — senão o
    // umu-run usa <prefixo>/pfx como prefixo (destruindo o prefixo real). WINEPREFIX manda.
  }
  if (gamePath) env.STEAM_COMPAT_INSTALL_PATH = gamePath;
  if (steamAppId) {
    env.SteamAppId = steamAppId;
    env.SteamGameId = steamAppId;
    env.GAMEID = steamAppId;
  }
  return env;
}

function ensureSteamAppIdFile(gamePath: string, steamAppId: string): void {
  if (!steamAppId || !gamePath) return;
  const appIdFile = path.join(gamePath, "steam_appid.txt");
  if (!fs.existsSync(appIdFile)) {
    try { fs.writeFileSync(appIdFile, steamAppId, "utf-8"); } catch { /* ignore */ }
  }
}

export async function launchGame(
  gameId: string,
  gamePath: string,
  prefixPath: string,
  steamAppId: string | undefined,
  _libraryPath: string | undefined,
  hasSkse: boolean,
  sksePath: string | null,
  protonPath: string,
  send: SendProgress,
): Promise<PlayResult> {
  const info = getGameInfo(gameId);
  const mod = getGameModule(gameId, gamePath);

  let launchExe = mod.getLaunchExe?.(gamePath, hasSkse, sksePath || undefined)
    || (hasSkse && sksePath ? sksePath : null)
    || (mod.preferredLaunchExe ? path.join(gamePath, mod.preferredLaunchExe) : null);

  // Jogos custom: o exe vem do games store (selecionado na instalação) ou da pasta
  if (!launchExe) {
    launchExe = await findCustomGameExecutable(gameId, gamePath, prefixPath);
  }

  if (!launchExe || !fs.existsSync(launchExe)) {
    send("launch", "Nenhum executável encontrado. Configure o executável em Configurar Jogo.", "error");
    return { success: false, error: "Nenhum executável encontrado" };
  }

  const env = buildLaunchEnv(steamAppId, gamePath, prefixPath, protonPath);
  const customEnv = mod.getLaunchEnv?.(gamePath, prefixPath, protonPath);
  if (customEnv) Object.assign(env, customEnv);

  if (steamAppId) ensureSteamAppIdFile(gamePath, steamAppId);

  send("launch", `Iniciando ${path.basename(launchExe)} via Makai Runner...`, "working");
  logger.info(`[Launch] === Makai Runner ===`);
  logger.info(`[Launch] gameId: ${gameId}, exe: ${launchExe}`);
  logger.info(`[Launch] WINEPREFIX: ${prefixPath}`);

  try {
    const result = await launchWithMakaiRunner({
      exePath: launchExe,
      prefixPath,
      protonPath,
      gameId,
      gamePath: path.dirname(launchExe),
      envOverrides: env,
    });

    if (result.success) {
      send("launch", `${info?.name || gameId} iniciado via Makai Runner!`, "done");
      return { success: true, method: "engine" };
    }
    const launchErr = result.error || "Falha ao iniciar o jogo via umu-run";
    send("launch", launchErr, "error");
    return { success: false, error: launchErr, method: "engine" };
  } catch (err) {
    const msg = `Makai Runner falhou: ${String(err).slice(0, 200)}`;
    logger.error(`[Launch] ${msg}`);
    send("launch", msg, "error");
    return { success: false, error: msg, method: "engine" };
  }
}

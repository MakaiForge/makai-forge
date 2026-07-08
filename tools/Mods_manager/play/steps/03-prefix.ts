import path from "node:path";
import fs from "node:fs";
import { logger } from "@main/services";
import { getGameModule } from "@games/registry";
import { ensurePrefixDir } from "@prefix/core/validate";
import { findSteamClientPath } from "@prefix/core/steam-paths";
import { runPythonCommand } from "../python";
import type { SendProgress } from "../types";

export interface PrefixResult {
  prefixPath: string
  created: boolean
}

function isValidPrefix(pfxPath: string): boolean {
  return (
    fs.existsSync(path.join(pfxPath, "user.reg")) &&
    fs.existsSync(path.join(pfxPath, "system.reg")) &&
    fs.existsSync(path.join(pfxPath, "drive_c")) &&
    fs.existsSync(path.join(pfxPath, "dosdevices"))
  );
}

function resolvePrefixDir(prefixPath: string): string | null {
  if (!prefixPath) return null;
  if (fs.existsSync(path.join(prefixPath, "user.reg"))) return prefixPath;
  if (fs.existsSync(path.join(prefixPath, "pfx", "user.reg"))) return path.join(prefixPath, "pfx");
  return null;
}

function _ensureTrackedFiles(compatDataPath: string) {
  if (compatDataPath) {
    const tracked = path.join(compatDataPath, "tracked_files");
    if (!fs.existsSync(tracked)) {
      fs.writeFileSync(tracked, "", "utf-8");
    }
  }
}

export async function ensurePrefix(
  gameId: string,
  prefixPath: string,
  protonPath: string,
  steamAppId: string | undefined,
  gamePath: string,
  libraryPath: string | undefined,
  send: SendProgress,
): Promise<PrefixResult> {
  send("prefix", "🔧 Verificando prefixo Wine/Proton...", "working");

  // Derive STEAM_COMPAT_DATA_PATH early
  let compatDataPath: string;
  if (libraryPath && steamAppId) {
    compatDataPath = path.join(libraryPath, "compatdata", steamAppId);
  } else if (path.basename(prefixPath) === "pfx") {
    compatDataPath = path.dirname(prefixPath);
  } else {
    compatDataPath = prefixPath;
  }

  // Check if configured prefix already exists and is valid
  const configuredPfx = resolvePrefixDir(prefixPath);
  if (configuredPfx && isValidPrefix(configuredPfx)) {
    _ensureTrackedFiles(compatDataPath);
    send("prefix", `✅ Prefixo configurado válido: ${configuredPfx}`, "done");
    return { prefixPath: configuredPfx, created: false };
  }

  // Fallback: use Steam compatdata if configured prefix doesn't exist
  if (steamAppId && libraryPath) {
    const steamCompat = path.join(libraryPath, "compatdata", steamAppId);
    const steamPrefix = path.join(steamCompat, "pfx");
    if (fs.existsSync(steamCompat) && isValidPrefix(steamPrefix)) {
      _ensureTrackedFiles(compatDataPath);
      send("prefix", `✅ Usando prefixo Steam: ${steamPrefix}`, "done");
      return { prefixPath: steamPrefix, created: false };
    }
  }

  // Prefix incomplete or missing — create via Python venv
  send("prefix", "⚙️ Prefixo incompleto ou ausente. Criando via Python...", "working");

  const gameModule = getGameModule(gameId, gamePath);
  const extraVerbs = gameModule.getWinetricksComponents?.() || [];

  // Call Python create-prefix
  const result = await runPythonCommand(
    "create-prefix",
    [gameId, prefixPath, protonPath, ...extraVerbs],
    {
      WINEPREFIX: prefixPath,
      STEAM_COMPAT_DATA_PATH: compatDataPath,
      STEAM_COMPAT_CLIENT_INSTALL_PATH: findSteamClientPath(),
      STEAM_COMPAT_INSTALL_PATH: gamePath,
      ...(steamAppId ? { SteamAppId: steamAppId, SteamGameId: steamAppId } : {}),
    },
  );

  if (result.success) {
    _ensureTrackedFiles(compatDataPath);
    send("prefix", "✅ Prefixo criado/validado com sucesso via Python", "done");
    return { prefixPath, created: true };
  }

  // Fallback: try ensurePrefixDir from TS
  logger.warn(`Python prefix creation failed: ${result.stderr}. Using TS fallback.`);
  send("prefix", "⚠️ Python falhou, usando fallback TypeScript...", "working");

  const pfx = ensurePrefixDir(prefixPath);
  if (!pfx) {
    send("prefix", "❌ Não foi possível criar o diretório do prefixo", "error");
    throw new Error("Cannot create prefix dir");
  }

  _ensureTrackedFiles(compatDataPath);
  send("prefix", "✅ Prefixo criado (fallback)", "done");
  return { prefixPath, created: true };
}

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
  _libraryPath: string | undefined,
  send: SendProgress,
): Promise<PrefixResult> {
  send("prefix", "🔧 Verificando prefixo Wine/Proton...", "working");

  // Derive compatDataPath: for custom prefixes (not inside Steam compatdata),
  // use the parent directory of the prefix path.
  const isSteamCompatPrefix = prefixPath.includes(path.sep + "compatdata" + path.sep);
  let compatDataPath: string;
  if (isSteamCompatPrefix) {
    // Standard Steam compatdata layout
    if (path.basename(prefixPath) === "pfx") {
      compatDataPath = path.dirname(prefixPath);
    } else {
      compatDataPath = prefixPath;
    }
  } else {
    // Custom prefix: parent directory
    compatDataPath = path.dirname(prefixPath);
  }

  // Check if configured prefix already exists and is valid
  const configuredPfx = resolvePrefixDir(prefixPath);
  if (configuredPfx && isValidPrefix(configuredPfx)) {
    _ensureTrackedFiles(compatDataPath);
    send("prefix", `✅ Prefixo configurado válido: ${configuredPfx}`, "done");
    return { prefixPath: configuredPfx, created: false };
  }

  // Configured prefix exists but is incomplete, or doesn't exist yet — create/complete it.
  // NEVER fall back to Steam compatdata: the user configured this prefix and expects mods here.
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

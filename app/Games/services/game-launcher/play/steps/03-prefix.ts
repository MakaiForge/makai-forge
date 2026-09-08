import path from "node:path";
import fs from "node:fs";
import { logger } from "@main/services";
import { createPrefix } from "@container/core/init";
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

function _ensureTrackedFiles(compatDataPath: string | undefined) {
  if (compatDataPath) {
    const tracked = path.join(compatDataPath, "tracked_files");
    if (!fs.existsSync(tracked)) {
      fs.writeFileSync(tracked, "", "utf-8");
    }
  }
}

function ensureDosDevices(prefixPath: string) {
  const candidates = [prefixPath, path.join(prefixPath, "pfx")];
  for (const dir of candidates) {
    if (!fs.existsSync(path.join(dir, "drive_c"))) continue;
    const dosdevicesDir = path.join(dir, "dosdevices");
    if (fs.existsSync(dosdevicesDir)) continue;
    try {
      fs.mkdirSync(dosdevicesDir, { recursive: true });
      fs.symlinkSync("../drive_c", path.join(dosdevicesDir, "c:"));
      logger.info(`[Prefix] Created dosdevices/c: → ../drive_c in ${dir}`);
    } catch (err) {
      logger.warn(`[Prefix] Failed to create dosdevices in ${dir}: ${err}`);
    }
  }
}

function getProtonVersionFile(pfxPath: string): string {
  return path.join(pfxPath, ".makai-proton-version");
}

/** Diretórios padrão do wine — tudo além disso em drive_c é dado de jogo. */
const WINE_SYSTEM_DIRS = new Set([
  "Program Files",
  "Program Files (x86)",
  "ProgramData",
  "Windows",
  "users",
  "tmp",
  "dosdevices",
  "drive_c",
  "pfx",
]);

/**
 * True se o drive_c do prefixo contém algo além da estrutura padrão do wine
 * (ex.: a pasta do jogo copiada). Prefixos com dados de jogo NUNCA devem ser
 * apagados ao trocar de Proton — só os .reg seriam recriados, o jogo não.
 */
function prefixHasGameData(pfxPath: string): boolean {
  const driveC = path.join(pfxPath, "drive_c");
  try {
    for (const entry of fs.readdirSync(driveC, { withFileTypes: true })) {
      if (entry.name === "pagefile.sys" || entry.name === "config.nt") continue;
      if (!WINE_SYSTEM_DIRS.has(entry.name)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function getStoredProtonVersion(pfxPath: string): string | null {
  const marker = getProtonVersionFile(pfxPath);
  if (!fs.existsSync(marker)) return null;
  try {
    return fs.readFileSync(marker, "utf-8").trim();
  } catch {
    return null;
  }
}

function setProtonVersion(pfxPath: string, protonPath: string): void {
  const version = path.basename(protonPath);
  try {
    fs.writeFileSync(getProtonVersionFile(pfxPath), version, "utf-8");
  } catch {}
}

export async function ensurePrefix(
  gameId: string,
  prefixPath: string,
  protonPath: string,
  _steamAppId: string | undefined,
  _gamePath: string,
  _libraryPath: string | undefined,
  send: SendProgress,
): Promise<PrefixResult> {
  send("prefix", "Verificando prefixo Wine/Proton...", "working");

  const isSteamCompatPrefix = prefixPath.includes(path.sep + "compatdata" + path.sep);
  let compatDataPath: string | undefined;
  if (isSteamCompatPrefix) {
    if (path.basename(prefixPath) === "pfx") {
      compatDataPath = path.dirname(prefixPath);
    } else {
      compatDataPath = prefixPath;
    }
  }
  // Prefixo custom (pasta única): compatDataPath fica undefined — createPrefix
  // NÃO seta STEAM_COMPAT_DATA_PATH (senão umu/proton usa <prefixo>/pfx como
  // prefixo e destrói o prefixo real). WINEPREFIX já aponta o prefixo.

  const configuredPfx = resolvePrefixDir(prefixPath);
  if (configuredPfx && isValidPrefix(configuredPfx)) {
    const storedVersion = getStoredProtonVersion(configuredPfx);
    const currentVersion = path.basename(protonPath);
    if (storedVersion && storedVersion !== currentVersion && !prefixHasGameData(configuredPfx)) {
      logger.warn(`[Prefix] Proton version mismatch: stored="${storedVersion}" current="${currentVersion}" — recreating prefix`);
      send("prefix", `Proton mudou (${storedVersion} → ${currentVersion}). Recriando prefixo...`, "working");
      try {
        fs.rmSync(configuredPfx, { recursive: true, force: true });
      } catch (err) {
        logger.error(`[Prefix] Failed to remove old prefix: ${err}`);
      }
    } else {
      // Mismatch com dados de jogo no prefixo → NÃO destruir: o wine atualiza o
      // prefixo no lugar; só atualizamos o marker do Proton.
      if (storedVersion && storedVersion !== currentVersion) {
        logger.warn(`[Prefix] Proton mudou (${storedVersion} → ${currentVersion}) mas o prefixo contém o jogo — mantendo prefixo (wine atualiza no lugar)`);
        send("prefix", `Proton mudou (${storedVersion} → ${currentVersion}). Mantendo prefixo com o jogo...`, "working");
      }
      setProtonVersion(configuredPfx, protonPath);
      _ensureTrackedFiles(compatDataPath);
      send("prefix", `Prefixo configurado válido: ${configuredPfx}`, "done");
      return { prefixPath: configuredPfx, created: false };
    }
  }

  send("prefix", "Prefixo incompleto ou ausente. Criando...", "working");

  const result = await createPrefix({
    protonPath,
    prefixPath,
    compatDataPath: compatDataPath || undefined,
    steamClientPath: protonPath,
    gameId,
    onProgress: (msg) => send("prefix", msg, "working"),
    timeout: 120000,
  });

  if (!result.success) {
    const errMsg = result.error || "Falha ao criar prefixo Wine/Proton";
    send("prefix", errMsg, "error");
    throw new Error(errMsg);
  }

  _ensureTrackedFiles(compatDataPath);
  setProtonVersion(prefixPath, protonPath);
  ensureDosDevices(prefixPath);
  send("prefix", "Prefixo criado/validado com sucesso", "done");
  return { prefixPath, created: true };
}

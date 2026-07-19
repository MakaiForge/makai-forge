import path from "node:path";
import fs from "node:fs";
import { logger } from "@main/services";
import { createPrefix } from "@prefix/core/init";
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
  steamAppId: string | undefined,
  gamePath: string,
  _libraryPath: string | undefined,
  send: SendProgress,
): Promise<PrefixResult> {
  send("prefix", "Verificando prefixo Wine/Proton...", "working");

  const isSteamCompatPrefix = prefixPath.includes(path.sep + "compatdata" + path.sep);
  let compatDataPath: string;
  if (isSteamCompatPrefix) {
    if (path.basename(prefixPath) === "pfx") {
      compatDataPath = path.dirname(prefixPath);
    } else {
      compatDataPath = prefixPath;
    }
  } else {
    compatDataPath = path.dirname(prefixPath);
  }

  const configuredPfx = resolvePrefixDir(prefixPath);
  if (configuredPfx && isValidPrefix(configuredPfx)) {
    const storedVersion = getStoredProtonVersion(configuredPfx);
    const currentVersion = path.basename(protonPath);
    if (storedVersion && storedVersion !== currentVersion) {
      logger.warn(`[Prefix] Proton version mismatch: stored="${storedVersion}" current="${currentVersion}" — recreating prefix`);
      send("prefix", `Proton mudou (${storedVersion} → ${currentVersion}). Recriando prefixo...`, "working");
      try {
        fs.rmSync(configuredPfx, { recursive: true, force: true });
      } catch (err) {
        logger.error(`[Prefix] Failed to remove old prefix: ${err}`);
      }
    } else {
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

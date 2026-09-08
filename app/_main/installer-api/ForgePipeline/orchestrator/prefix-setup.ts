import fs from "node:fs"
import path from "node:path"
import { app } from "electron"
import { createPrefix, prefixExists } from "@container/core/init"
import { logger } from "@main/services"

export function getUmuBinaryPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app/_resources/binaries/umu-run")
    : path.join(app.getAppPath(), "app", "_resources", "binaries", "umu-run")
}

export function resolveActualPrefix(prefixPath: string): string {
  const driveC = path.join(prefixPath, "drive_c")
  if (fs.existsSync(driveC)) return prefixPath
  const pfx = path.join(prefixPath, "pfx")
  if (fs.existsSync(path.join(pfx, "drive_c"))) return pfx
  return prefixPath
}

/**
 * Prefixo válido = prefixo Wine de verdade (user.reg/system.reg reais +
 * drive_c + dosdevices). Nunca criar arquivos .reg "marcadores" aqui: stubs
 * como "REGEDIT4\n\n" fazem o wineboot falhar com "not a valid registry file".
 */
function prefixIsValid(prefixPath: string): boolean {
  return prefixExists(resolveActualPrefix(prefixPath))
}

export async function setupPrefix(
  gameId: string,
  protonPath: string,
  winePrefixPath: string,
  onLog?: (msg: string) => void
): Promise<boolean> {
  const actual = resolveActualPrefix(winePrefixPath)
  if (prefixIsValid(actual)) {
    if (onLog) onLog(`Prefixo já existe em: ${actual}`)
    return true
  }

  if (!fs.existsSync(winePrefixPath)) {
    fs.mkdirSync(winePrefixPath, { recursive: true })
  }

  if (onLog) onLog(`Criando prefixo Wine em: ${actual}`)

  const result = await createPrefix({
    protonPath,
    prefixPath: actual,
    gameId,
    timeout: 120000,
    onProgress: onLog,
  })
  const valid = result.success && prefixIsValid(actual)
  if (valid) {
    logger.info(`[setupPrefix] Prefix created at ${actual}`)
    if (onLog) onLog(`Prefixo criado com sucesso.`)
  } else {
    logger.error(`[setupPrefix] Prefix invalid at ${actual}: ${result.error}`)
    if (onLog) onLog(`Falha: ${result.error || "prefixo inválido"}`)
  }
  return valid
}

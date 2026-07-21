import fs from "node:fs"
import path from "node:path"
import { app } from "electron"
import { createPrefix } from "@container/core/init"
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

function ensurePrefixMarkers(prefixPath: string) {
  for (const name of ["system.reg", "user.reg", "userdef.reg"]) {
    const filePath = path.join(prefixPath, name)
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "REGEDIT4\n\n", "utf-8")
    }
  }
}

const PREFIX_MARKERS = ["drive_c", "dosdevices", "system.reg", "user.reg", "userdef.reg"]

function prefixIsValid(prefixPath: string): boolean {
  return PREFIX_MARKERS.every((f) => fs.existsSync(path.join(prefixPath, f)))
}

export async function setupPrefix(
  gameId: string,
  protonPath: string,
  winePrefixPath: string,
  onLog?: (msg: string) => void
): Promise<boolean> {
  if (prefixIsValid(winePrefixPath)) {
    if (onLog) onLog(`Prefixo já existe em: ${winePrefixPath}`)
    return true
  }

  if (!fs.existsSync(winePrefixPath)) {
    fs.mkdirSync(winePrefixPath, { recursive: true })
  }

  if (onLog) onLog(`Criando prefixo Wine em: ${winePrefixPath}`)

  const result = await createPrefix({
    protonPath,
    prefixPath: winePrefixPath,
    gameId,
    timeout: 120000,
    onProgress: onLog,
  })
  const actual = resolveActualPrefix(winePrefixPath)
  ensurePrefixMarkers(actual)
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

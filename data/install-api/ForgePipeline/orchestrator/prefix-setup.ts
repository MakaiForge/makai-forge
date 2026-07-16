import fs from "node:fs"
import path from "node:path"
import { MakaiRPC } from "@mods-manager/services/makai-rpc"
import { logger } from "@main/services"

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

  try {
    await MakaiRPC.call("create_prefix", {
      game_id: gameId,
      proton_path: protonPath,
      prefix_path: winePrefixPath,
      auto_dlls: false,
      game_path: "",
    })
    const actual = resolveActualPrefix(winePrefixPath)
    ensurePrefixMarkers(actual)
    const valid = prefixIsValid(actual)
    if (valid) {
      logger.info(`[setupPrefix] Prefix created at ${actual}`)
      if (onLog) onLog(`Prefixo criado com sucesso.`)
    } else {
      logger.error(`[setupPrefix] Prefix invalid at ${actual}`)
      if (onLog) onLog(`Falha: prefixo inválido em ${actual}`)
    }
    return valid
  } catch (err) {
    logger.error(`[setupPrefix] RPC error: ${err}`)
    if (onLog) onLog(`Erro ao criar prefixo via RPC.`)
    return false
  }
}

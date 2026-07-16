import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { detectInstallerType } from "./installer-detector"
import { copyToPrefix } from "./prefix-copier"
import { scanPrefixForExes } from "./prefix-scanner"
import { snapshotPrefix, findNewExecutables } from "./snapshot"
import type { InstallResult, ProgressCallback } from "./types"

function resolveActualPrefix(prefixPath: string): string {
  const driveC = path.join(prefixPath, "drive_c")
  if (fs.existsSync(path.join(driveC, "windows", "system32"))) return prefixPath
  const pfx = path.join(prefixPath, "pfx")
  if (fs.existsSync(path.join(pfx, "drive_c", "windows", "system32"))) return pfx
  return prefixPath
}

function getMakaiTimePrefixDir(): string {
  return path.resolve(__dirname, "..", "..", "..", "prefix")
}

function getPythonBin(): string {
  return process.env.PYTHON_PATH || "python3"
}

function runInstallerInContainer(
  installerExe: string,
  protonPath: string,
  prefixPath: string,
  gamePath: string
): Promise<{ exitCode: number; error?: string }> {
  return new Promise((resolve) => {
    const expandedProton = path.resolve(protonPath)
    const expandedPrefix = path.resolve(prefixPath)
    const prefixDir = getMakaiTimePrefixDir()

    const proc = spawn(getPythonBin(), [
      "-m", "makai_time.makai_time",
      "--game-exe", installerExe,
      "--proton-path", expandedProton,
      "--prefix-path", expandedPrefix,
      "--game-path", gamePath,
      "--quiet",
    ], {
      cwd: prefixDir,
      stdio: "ignore",
    })

    proc.on("exit", (code) => {
      resolve({ exitCode: code ?? -1 })
    })

    proc.on("error", (err) => {
      resolve({ exitCode: -1, error: err.message })
    })
  })
}

export async function installGame(
  sourcePath: string,
  options: {
    prefixPath: string
    protonPath: string
    gameId?: string
    existingExePath?: string
    onProgress?: ProgressCallback
  }
): Promise<InstallResult> {
  const { prefixPath, protonPath, gameId, existingExePath, onProgress } = options
  const absSource = path.resolve(sourcePath)
  const absPrefix = path.resolve(prefixPath)
  const actual = resolveActualPrefix(absPrefix)
  const driveC = path.join(actual, "drive_c")
  const gameFolderName = path.basename(absSource.replace(/[\\/]+$/, ""))

  const progress = (step: string, pct: number, msg: string) => {
    onProgress?.(step, pct, msg)
  }

  // If already has configured exe, copy folder + scan
  if (existingExePath && fs.existsSync(existingExePath)) {
    progress("copying", 50, "Copiando jogo para o prefixo...")
    const sourceStat = fs.statSync(absSource, { throwIfNoEntry: false })
    if (!sourceStat) {
      progress("error", 45, "Diretório fonte não encontrado")
      return {
        success: false,
        candidates: [],
        suggested_dir: driveC,
        method: "restore",
        error: `Diretório não encontrado: ${absSource}`,
      }
    }
    const folder = sourceStat.isDirectory()
      ? absSource
      : path.dirname(absSource)
    if (fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory()) {
      await copyToPrefix(folder, absPrefix, (pct) => {
        progress("copying", 50 + Math.round(pct * 0.3), `Copiando... ${pct}%`)
      })
    }
    progress("scanning", 85, "Procurando executáveis...")
    const scan = scanPrefixForExes(absPrefix, gameFolderName)
    progress("complete", 100, `${scan.candidates.length} executável(eis) encontrado(s)`)
    return {
      success: true,
      candidates: scan.candidates,
      suggested_dir: path.dirname(existingExePath),
      method: "restore",
    }
  }

  // 1. Detect type
  progress("analyzing", 5, "Analisando instalador...")
  const detection = detectInstallerType(absSource)
  const isInstaller = detection.is_installer
  const installerPath = detection.installer_path

  if (isInstaller) {
    progress("preparing", 10, `Instalador: ${path.basename(installerPath!)}`)

    // Snapshot BEFORE
    progress("snapshot", 15, "Registrando estado do prefixo...")
    const before = snapshotPrefix(absPrefix)

    // Run installer
    progress("installing", 30, "Executando instalador...")
    const gameDir = path.dirname(installerPath!)
    const result = await runInstallerInContainer(
      installerPath!,
      protonPath,
      absPrefix,
      gameDir
    )

    if (result.exitCode !== 0 && result.exitCode !== -1) {
      progress("error", 50, `Instalador encerrou com código ${result.exitCode}`)
    }

    // Snapshot AFTER
    progress("scanning", 70, "Verificando novos arquivos...")
    const after = snapshotPrefix(absPrefix)

    // Compare
    const candidates = findNewExecutables(before, after)

    if (candidates.length > 0) {
      progress("complete", 100, `${candidates.length} executável(eis) encontrado(s)`)
      return {
        success: true,
        candidates: candidates.map((e) => ({
          path: e.path,
          name: path.basename(e.path),
          size: e.size,
        })),
        suggested_dir: driveC,
        method: "installer",
      }
    }

    // Fallback: copy game folder to prefix
    progress("copying", 80, "Nenhum executável encontrado. Copiando pasta...")
    const fallbackStat = fs.statSync(absSource, { throwIfNoEntry: false })
    const folderPath = fallbackStat?.isDirectory()
      ? absSource
      : path.dirname(absSource)

    const copyResult = await copyToPrefix(folderPath, absPrefix, (pct) => {
      progress("copying", 80 + Math.round(pct * 0.1), `Copiando... ${pct}%`)
    })

    if (!copyResult.success) {
      return {
        success: false,
        candidates: [],
        suggested_dir: driveC,
        method: "installer_fallback_copy",
        error: copyResult.error ?? "Falha ao copiar pasta",
      }
    }

    progress("scanning", 92, "Procurando executáveis após cópia...")
    const scan = scanPrefixForExes(absPrefix, gameFolderName)

    progress("complete", 100, `${scan.candidates.length} executável(eis) encontrado(s)`)
    return {
      success: true,
      candidates: scan.candidates,
      suggested_dir: scan.suggested_dir,
      method: "installer_fallback_copy",
    }
  }

  // Portable: copy folder + scan
  progress("copying", 5, "Copiando jogo portátil para o prefixo...")

  // Security validations
  if (detection.exe_count === 0 && detection.total_files > 0) {
    progress("copying", 5, "Aviso: nenhum .exe encontrado na pasta, copiando mesmo assim...")
  }
  if (detection.total_files > 5000) {
    progress("copying", 5, "Aviso: pasta com muitos arquivos, pode demorar...")
  }
  if (detection.total_files > 50000) {
    return {
      success: false,
      candidates: [],
      suggested_dir: driveC,
      method: "portable",
      error: `Pasta muito grande (${detection.total_files} arquivos). Selecione a pasta do jogo diretamente.`,
    }
  }

  let folderToCopy = absSource
  const portableStat = fs.statSync(absSource, { throwIfNoEntry: false })
  if (!portableStat) {
    return {
      success: false,
      candidates: [],
      suggested_dir: driveC,
      method: "portable",
      error: `source_path não encontrado: ${absSource}`,
    }
  }
  if (portableStat.isFile()) {
    folderToCopy = path.dirname(absSource)
  }

  const copyResult = await copyToPrefix(folderToCopy, absPrefix, (pct) => {
    progress("copying", 5 + Math.round(pct * 0.92), `Copiando... ${pct}%`)
  })

  if (!copyResult.success) {
    return {
      success: false,
      candidates: [],
      suggested_dir: driveC,
      method: "portable",
      error: copyResult.error ?? "Falha ao copiar pasta",
    }
  }

  progress("scanning", 97, "Procurando executáveis...")
  const scan = scanPrefixForExes(absPrefix, gameFolderName)

  progress("complete", 100, `${scan.candidates.length} executável(eis) encontrado(s)`)
  return {
    success: true,
    candidates: scan.candidates,
    suggested_dir: scan.suggested_dir,
    method: "portable",
  }
}

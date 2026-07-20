import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { MakaiRPC } from "@mods-manager/services/makai-rpc"
import type { InstallResult, ProgressCallback } from "./types"

function resolveActualPrefix(prefixPath: string): string {
  const driveC = path.join(prefixPath, "drive_c")
  if (fs.existsSync(path.join(driveC, "windows", "system32"))) return prefixPath
  const pfx = path.join(prefixPath, "pfx")
  if (fs.existsSync(path.join(pfx, "drive_c", "windows", "system32"))) return pfx
  return prefixPath
}

function getMakrunDir(): string {
  return path.resolve(__dirname, "..", "..", "tools", "prefix", "makai_time")
}

function getPythonBin(): string {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH
  return path.resolve(__dirname, "..", "..", "tools", "venv", "bin", "python3")
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
    const makrunDir = getMakrunDir()

    const proc = spawn(getPythonBin(), [
      "-m", "makrun",
      "waitforexitandrun", installerExe,
    ], {
      cwd: makrunDir,
      stdio: "ignore",
      env: {
        ...process.env as Record<string, string>,
        WINEPREFIX: expandedPrefix,
        PROTONPATH: expandedProton,
      },
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
      await MakaiRPC.call("copy_to_prefix", {
        source_path: folder,
        prefix_path: absPrefix,
      })
      progress("copying", 80, "Cópia concluída")
    }
    progress("scanning", 85, "Procurando executáveis...")
    const scan = await MakaiRPC.call<any>("scan_prefix_for_exes", {
      prefix_path: absPrefix,
      game_folder_name: gameFolderName,
    })
    progress("complete", 100, `${scan.candidates.length} executável(eis) encontrado(s)`)
    return {
      success: true,
      candidates: scan.candidates,
      suggested_dir: path.dirname(existingExePath),
      method: "restore",
    }
  }

  // 1. Detect type via Python RPC
  progress("analyzing", 5, "Analisando instalador...")
  const detection = await MakaiRPC.call<any>("detect_installer_type", {
    source_path: absSource,
  })
  const isInstaller = detection.is_installer
  const installerPath = detection.installer_path

  if (isInstaller) {
    progress("preparing", 10, `Instalador: ${path.basename(installerPath!)}`)

    // Snapshot BEFORE via Python RPC
    progress("snapshot", 15, "Registrando estado do prefixo...")
    const before = await MakaiRPC.call<any>("snapshot_prefix", {
      prefix_path: absPrefix,
    })

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

    // Snapshot AFTER via Python RPC
    progress("scanning", 70, "Verificando novos arquivos...")
    const after = await MakaiRPC.call<any>("snapshot_prefix", {
      prefix_path: absPrefix,
    })

    // Compare via Python RPC
    const candidates = await MakaiRPC.call<any>("find_new_executables", {
      before,
      after,
    })

    if (candidates.length > 0) {
      progress("complete", 100, `${candidates.length} executável(eis) encontrado(s)`)
      return {
        success: true,
        candidates: candidates.map((e: any) => ({
          path: e.path,
          name: path.basename(e.path),
          size: e.size,
        })),
        suggested_dir: driveC,
        method: "installer",
      }
    }

    // Instalador não produziu executáveis — falha, não copia lixo
    progress("error", 90, "Instalador não produziu executáveis detectáveis")
    return {
      success: false,
      candidates: [],
      suggested_dir: driveC,
      method: "installer",
      error: "Instalador executado mas nenhum .exe foi criado no prefixo",
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

  const copyResult = await MakaiRPC.call<any>("copy_to_prefix", {
    source_path: folderToCopy,
    prefix_path: absPrefix,
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
  const scan = await MakaiRPC.call<any>("scan_prefix_for_exes", {
    prefix_path: absPrefix,
    game_folder_name: gameFolderName,
  })

  progress("complete", 100, `${scan.candidates.length} executável(eis) encontrado(s)`)
  return {
    success: true,
    candidates: scan.candidates,
    suggested_dir: scan.suggested_dir,
    method: "portable",
  }
}

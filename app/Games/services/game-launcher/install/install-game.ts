import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { app } from "electron"
import { MakaiRPC } from "@mods-manager/services/makai-rpc"
import type { InstallResult, ProgressCallback } from "./types"

function resolveActualPrefix(prefixPath: string): string {
  const driveC = path.join(prefixPath, "drive_c")
  if (fs.existsSync(path.join(driveC, "windows", "system32"))) return prefixPath
  const pfx = path.join(prefixPath, "pfx")
  if (fs.existsSync(path.join(pfx, "drive_c", "windows", "system32"))) return pfx
  return prefixPath
}

function getUmuBinaryPath(): string {
  // __dirname no bundle (out/main) NÃO resolve para o repo — usar app.getAppPath()
  return app.isPackaged
    ? path.join(process.resourcesPath, "app", "_resources", "binaries", "umu-run")
    : path.join(app.getAppPath(), "app", "_resources", "binaries", "umu-run")
}

/**
 * Modo "instalação limpa": desativa as funções extras do Proton (DXVK, ESYNC,
 * FSYNC, NVAPI) DURANTE o instalador — vídeos/previews de instaladores podem
 * quebrar sob DXVK e syncs. O env do launch do jogo (launch-game.ts) não é
 * tocado: o Proton volta ao normal automaticamente no próximo spawn.
 */
const INSTALL_CLEAN_ENV: Record<string, string> = {
  PROTON_NO_ESYNC: "1",
  PROTON_NO_FSYNC: "1",
  WINEESYNC: "0",
  WINEFSYNC: "0",
  PROTON_USE_WINED3D: "1",
  PROTON_DISABLE_DXVK: "1",
  PROTON_DISABLE_NVAPI: "1",
  PROTON_ENABLE_NVAPI: "0",
}

function runInstallerInContainer(
  installerExe: string,
  protonPath: string,
  prefixPath: string,
  _gamePath: string
): Promise<{ exitCode: number; error?: string }> {
  return new Promise((resolve) => {
    const expandedProton = path.resolve(protonPath)
    const expandedPrefix = path.resolve(prefixPath)
    const umuBinary = getUmuBinaryPath()
    // umu-run é um zipapp auto-contido (python embutido) — executar DIRETO.
    if (!fs.existsSync(umuBinary)) {
      resolve({ exitCode: -1, error: "umu-run não encontrado" })
      return
    }
    const args = [installerExe]
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      PROTON_LOG: "1",
      WINEPREFIX: expandedPrefix,
      PROTONPATH: expandedProton,
      // Desativa as funções do Proton durante a instalação (DXVK/ESYNC/FSYNC/NVAPI)
      ...INSTALL_CLEAN_ENV,
    }
    delete env.PYTHONHOME
    delete env.PYTHONPATH
    delete env.PYTHONSTARTUP
    delete env.PYTHONOPTIMIZE

    const proc = spawn(umuBinary, args, {
      stdio: "ignore",
      detached: true,
      env,
    })

    proc.on("exit", (code) => {
      proc.unref()
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
  const { prefixPath, protonPath, existingExePath, onProgress } = options
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
      const copyResult = await MakaiRPC.call<any>("copy_to_prefix", {
        source_path: folder,
        prefix_path: absPrefix,
      })
      // Validação: a cópia só conta se os SHA256 conferiram (hashes_ok)
      if (!copyResult?.success) {
        progress("error", 45, copyResult?.error || "Falha ao copiar pasta")
        return {
          success: false,
          candidates: [],
          suggested_dir: driveC,
          method: "restore",
          error: copyResult?.error || "Falha ao copiar pasta",
        }
      }
      const mismatches = copyResult?.mismatches?.length || 0
      if (copyResult?.hashes_ok === false || mismatches > 0) {
        progress("error", 45, `${mismatches} arquivo(s) com hash divergente após a cópia`)
        return {
          success: false,
          candidates: [],
          suggested_dir: driveC,
          method: "restore",
          error: `${mismatches} arquivo(s) com hash divergente após a cópia`,
        }
      }
      progress("copying", 80, `Cópia concluída e verificada (${copyResult.files_count ?? "?"} arquivos)`)
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
      // A janela de seleção deve apontar para os exes COPIADOS no prefixo
      // (drive_c), nunca para o diretório original de download.
      suggested_dir: scan.suggested_dir || path.dirname(existingExePath),
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

    // Falha no spawn = instalador nem abriu → para aqui (não copia lixo).
    if (result.exitCode === -1) {
      progress("error", 50, result.error || "Não foi possível abrir o instalador")
      return {
        success: false,
        candidates: [],
        suggested_dir: driveC,
        method: "installer",
        error: result.error || "Não foi possível abrir o instalador (spawn falhou)",
      }
    }
    // Exit != 0: o instalador pode ter instalado mesmo assim — o checker
    // (snapshot antes/depois) decide; aqui só avisa.
    if (result.exitCode !== 0) {
      progress("installing", 55, `Instalador encerrou com código ${result.exitCode} — verificando o que foi instalado...`)
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

  if (!copyResult?.success) {
    return {
      success: false,
      candidates: [],
      suggested_dir: driveC,
      method: "portable",
      error: copyResult?.error ?? "Falha ao copiar pasta",
    }
  }

  // Validação: confirma que a pasta foi REALMENTE copiada (SHA256 pré/pós)
  const mismatches = copyResult?.mismatches?.length || 0
  if (copyResult?.hashes_ok === false || mismatches > 0) {
    progress("error", 90, `${mismatches} arquivo(s) com hash divergente após a cópia`)
    return {
      success: false,
      candidates: [],
      suggested_dir: driveC,
      method: "portable",
      error: `${mismatches} arquivo(s) com hash divergente após a cópia`,
    }
  }
  progress("copying", 90, `Cópia concluída e verificada (${copyResult.files_count ?? "?"} arquivos)`)

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

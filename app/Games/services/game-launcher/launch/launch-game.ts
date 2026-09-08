import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { spawn } from "node:child_process"
import { app } from "electron"
import type { LaunchOptions, LaunchResult } from "./types"

function getUmuBinaryPath(): string {
  // __dirname no bundle (out/main) NÃO resolve para o repo — usar app.getAppPath()
  return app.isPackaged
    ? path.join(process.resourcesPath, "app", "_resources", "binaries", "umu-run")
    : path.join(app.getAppPath(), "app", "_resources", "binaries", "umu-run")
}

function buildUmuEnv(options: {
  resolvedPrefix: string
  resolvedProton: string
  gameId?: string
  gamePath?: string
  envOverrides?: Record<string, string>
}): Record<string, string> {
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    PROTON_LOG: "1",
    WINEPREFIX: options.resolvedPrefix,
    PROTONPATH: options.resolvedProton,
  }
  // PYTHONHOME/PYTHONPATH do host quebram o python dentro do Steam Runtime
  // (pressure-vessel): "Failed to import encodings module".
  delete env.PYTHONHOME
  delete env.PYTHONPATH
  delete env.PYTHONSTARTUP
  delete env.PYTHONOPTIMIZE
  if (options.gameId) env.GAMEID = `umu-${options.gameId}`
  if (options.gamePath && !env.STEAM_COMPAT_INSTALL_PATH) {
    env.STEAM_COMPAT_INSTALL_PATH = path.resolve(options.gamePath)
  }
  if (options.envOverrides) Object.assign(env, options.envOverrides)
  return env
}

const UMU_LOG_DIR = path.join(os.homedir(), ".cache", "makai-forge")

function appendLog(file: string, msg: string) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, msg)
  } catch {}
}

export async function launchGame(options: LaunchOptions): Promise<LaunchResult> {
  const { exePath, prefixPath, protonPath, gameId, gamePath, envOverrides, onLog } = options

  const resolvedExe = path.resolve(exePath)
  const resolvedPrefix = path.resolve(prefixPath)
  const resolvedProton = path.resolve(protonPath)
  const umuBinary = getUmuBinaryPath()
  // umu-run é um zipapp auto-contido (python embutido) — executar DIRETO.
  if (!fs.existsSync(umuBinary)) {
    return Promise.resolve({ success: false, error: "umu-run não encontrado" })
  }

  const spawnEnv = buildUmuEnv({ resolvedPrefix, resolvedProton, gameId, gamePath, envOverrides })
  const args = [resolvedExe]

  onLog?.(`Iniciando umu-run: ${umuBinary} ${args.join(" ")}`)

  return new Promise<LaunchResult>((resolve) => {
    const proc = spawn(umuBinary, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: spawnEnv,
    })

    proc.stdout?.on("data", (data: Buffer) => {
      for (const line of data.toString().trim().split("\n")) onLog?.(line)
    })
    proc.stderr?.on("data", (data: Buffer) => {
      for (const line of data.toString().trim().split("\n")) onLog?.(`[stderr] ${line}`)
    })

    proc.on("error", (err) => resolve({ success: false, error: err.message }))
    proc.on("exit", (code) => {
      proc.unref()
      resolve({
        success: code === 0,
        pid: proc.pid,
        method: "umu-run",
        error: code !== 0 ? `umu-run exit code: ${code}` : undefined,
      })
    })
  })
}

export function launchGameDetached(options: LaunchOptions): boolean {
  const { exePath, prefixPath, protonPath, gameId, gamePath, envOverrides } = options

  if (!exePath || !prefixPath || !protonPath) return false

  const resolvedExe = path.resolve(exePath)
  const resolvedPrefix = path.resolve(prefixPath)
  const resolvedProton = path.resolve(protonPath)
  const umuBinary = getUmuBinaryPath()
  // umu-run é um zipapp auto-contido (python embutido) — executar DIRETO.
  if (!fs.existsSync(umuBinary)) return false

  const spawnEnv = buildUmuEnv({ resolvedPrefix, resolvedProton, gameId, gamePath, envOverrides })
  const args = [resolvedExe]

  const logFile = path.join(UMU_LOG_DIR, `umu-launch-${Date.now()}.log`)
  try {
    fs.mkdirSync(UMU_LOG_DIR, { recursive: true })
    const stderrFd = fs.openSync(logFile, "a")
    appendLog(logFile, `[${new Date().toISOString()}] umu-run launch\n`)
    appendLog(logFile, `  exe: ${resolvedExe}\n`)
    appendLog(logFile, `  WINEPREFIX: ${resolvedPrefix}\n`)
    appendLog(logFile, `  PROTONPATH: ${resolvedProton}\n`)
    if (gameId) appendLog(logFile, `  GAMEID: umu-${gameId}\n`)

    const proc = spawn(umuBinary, args, {
      stdio: ["ignore", "ignore", stderrFd],
      detached: true,
      env: spawnEnv,
    })
    proc.unref()
    fs.closeSync(stderrFd)
    return true
  } catch (err) {
    appendLog(logFile, `SPAWN ERROR: ${err}\n`)
    return false
  }
}

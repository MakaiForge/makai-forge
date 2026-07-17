import path from "node:path"
import fs from "node:fs"
import { spawn } from "node:child_process"
import type { LaunchOptions, LaunchResult } from "./types"

function getMakrunDir(): string {
  return path.resolve(__dirname, "..", "..", "tools", "prefix", "makai_time")
}

function getPythonBin(): string {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH
  return path.resolve(__dirname, "..", "..", "tools", "venv", "bin", "python3")
}

export async function launchGame(options: LaunchOptions): Promise<LaunchResult> {
  const { exePath, prefixPath, protonPath, gamePath, envOverrides, onLog } = options

  const resolvedExe = path.resolve(exePath)
  const resolvedPrefix = path.resolve(prefixPath)
  const resolvedProton = path.resolve(protonPath)
  const makrunDir = getMakrunDir()

  const spawnEnv: Record<string, string> = { ...process.env as Record<string, string> }
  spawnEnv.WINEPREFIX = resolvedPrefix
  spawnEnv.PROTONPATH = resolvedProton
  if (envOverrides) {
    Object.assign(spawnEnv, envOverrides)
  }
  if (gamePath && !spawnEnv.STEAM_COMPAT_INSTALL_PATH) {
    spawnEnv.STEAM_COMPAT_INSTALL_PATH = path.resolve(gamePath)
  }

  const args = ["-m", "makrun", "waitforexitandrun", resolvedExe]

  onLog?.(`Iniciando Makai Runner: python3 -m makrun waitforexitandrun ${resolvedExe}`)

  return new Promise<LaunchResult>((resolve) => {
    const proc = spawn(getPythonBin(), args, {
      cwd: makrunDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: spawnEnv,
    })

    proc.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().trim().split("\n")
      for (const line of lines) {
        onLog?.(line)
      }
    })

    proc.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().trim().split("\n")
      for (const line of lines) {
        onLog?.(`[stderr] ${line}`)
      }
    })

    proc.on("error", (err) => {
      resolve({ success: false, error: err.message })
    })

    proc.on("exit", (code) => {
      resolve({
        success: code === 0,
        pid: proc.pid,
        method: "makrun",
        error: code !== 0 ? `Makai Runner exit code: ${code}` : undefined,
      })
    })
  })
}

export function launchGameDetached(options: LaunchOptions): boolean {
  const { exePath, prefixPath, protonPath, gamePath, envOverrides } = options

  if (!exePath || !prefixPath || !protonPath) return false

  const resolvedExe = path.resolve(exePath)
  const resolvedPrefix = path.resolve(prefixPath)
  const resolvedProton = path.resolve(protonPath)
  const makrunDir = getMakrunDir()

  const spawnEnv: Record<string, string> = { ...process.env as Record<string, string> }
  spawnEnv.WINEPREFIX = resolvedPrefix
  spawnEnv.PROTONPATH = resolvedProton
  if (envOverrides) {
    Object.assign(spawnEnv, envOverrides)
  }
  if (gamePath && !spawnEnv.STEAM_COMPAT_INSTALL_PATH) {
    spawnEnv.STEAM_COMPAT_INSTALL_PATH = path.resolve(gamePath)
  }

  const args = ["-m", "makrun", "waitforexitandrun", resolvedExe]

  try {
    const proc = spawn(getPythonBin(), args, {
      cwd: makrunDir,
      stdio: "ignore",
      detached: true,
      env: spawnEnv,
    })
    proc.unref()
    return true
  } catch {
    return false
  }
}

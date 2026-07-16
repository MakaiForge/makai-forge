import path from "node:path"
import fs from "node:fs"
import { spawn } from "node:child_process"
import type { LaunchOptions, LaunchResult } from "./types"

function getMakaiTimePrefixDir(): string {
  return path.resolve(__dirname, "..", "..", "..", "prefix")
}

function getPythonBin(): string {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH
  // Built main process in out/main/, venv at tools/venv/
  const buildRelative = path.resolve(__dirname, "..", "..", "tools", "venv", "bin", "python3")
  if (fs.existsSync(buildRelative)) return buildRelative
  // Dev fallback: tools/game_launcher/launch/ -> tools/venv/
  const devRelative = path.resolve(__dirname, "..", "..", "..", "venv", "bin", "python3")
  if (fs.existsSync(devRelative)) return devRelative
  // Absolute project root
  const cwdRelative = path.resolve(process.cwd(), "tools", "venv", "bin", "python3")
  if (fs.existsSync(cwdRelative)) return cwdRelative
  return "python3"
}

export async function launchGame(options: LaunchOptions): Promise<LaunchResult> {
  const { exePath, prefixPath, protonPath, gamePath, envOverrides, onLog } = options

  const resolvedExe = path.resolve(exePath)
  const resolvedPrefix = path.resolve(prefixPath)
  const resolvedProton = path.resolve(protonPath)
  const prefixDir = getMakaiTimePrefixDir()

  const args = [
    "-m", "makai_time.makai_time",
    "--game-exe", resolvedExe,
    "--proton-path", resolvedProton,
    "--prefix-path", resolvedPrefix,
    "--quiet",
  ]

  if (gamePath) {
    args.push("--game-path", path.resolve(gamePath))
  }

  if (envOverrides) {
    for (const [key, val] of Object.entries(envOverrides)) {
      args.push("--env", `${key}=${val}`)
    }
  }

  onLog?.(`Iniciando Makai Time: python3 -m makai_time.makai_time`)

  return new Promise<LaunchResult>((resolve) => {
    const proc = spawn(getPythonBin(), args, {
      cwd: prefixDir,
      stdio: ["ignore", "pipe", "pipe"],
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
        method: "makai_time",
        error: code !== 0 ? `Makai Time exit code: ${code}` : undefined,
      })
    })
  })
}

export function launchGameDetached(options: LaunchOptions): boolean {
  const { exePath, prefixPath, protonPath, gamePath, envOverrides } = options

  const resolvedExe = path.resolve(exePath)
  const resolvedPrefix = path.resolve(prefixPath)
  const resolvedProton = path.resolve(protonPath)
  const prefixDir = getMakaiTimePrefixDir()

  const args = [
    "-m", "makai_time.makai_time",
    "--game-exe", resolvedExe,
    "--proton-path", resolvedProton,
    "--prefix-path", resolvedPrefix,
    "--quiet",
  ]

  if (gamePath) {
    args.push("--game-path", path.resolve(gamePath))
  }

  if (envOverrides) {
    for (const [key, val] of Object.entries(envOverrides)) {
      args.push("--env", `${key}=${val}`)
    }
  }

  try {
    const proc = spawn(getPythonBin(), args, {
      cwd: prefixDir,
      stdio: "ignore",
      detached: true,
    })
    proc.unref()
    return true
  } catch {
    return false
  }
}

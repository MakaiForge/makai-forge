/**
 * Debug logging system for installation flow.
 *
 * Toggle: set env DEBUG_INSTALL=1 before launching the app.
 * Output: writes JSON lines to install-debug.json in the app's userData folder.
 *
 * Usage:
 *   import { debugLog } from "@provision/debug-log"
 *   debugLog.log("parser", { yaml: "...", parsed: {...} })
 *   debugLog.end({ success: true })
 *
 * When DEBUG_INSTALL is not set, all methods are no-ops.
 */

import fs from "node:fs"
import path from "node:path"
import { app } from "electron"

const IS_DEBUG = !!process.env.DEBUG_INSTALL

interface DebugEntry {
  timestamp: string
  step: string
  data: Record<string, unknown>
}

class DebugLog {
  private entries: DebugEntry[] = []
  private logPath: string | null = null
  private sessionId: string = ""
  private started = false

  start(sessionId?: string): void {
    if (!IS_DEBUG) return
    this.sessionId = sessionId || `install-${Date.now()}`
    this.entries = []
    this.started = true

    try {
      const userDataPath = app.getPath("userData")
      this.logPath = path.join(userDataPath, "install-debug.json")
      // Clear previous log
      fs.writeFileSync(this.logPath, "", "utf-8")
    } catch {
      this.logPath = null
    }

    this.log("session_start", { sessionId: this.sessionId })
  }

  log(step: string, data: Record<string, unknown> = {}): void {
    if (!IS_DEBUG || !this.started) return

    const entry: DebugEntry = {
      timestamp: new Date().toISOString(),
      step,
      data,
    }
    this.entries.push(entry)

    if (this.logPath) {
      try {
        fs.appendFileSync(this.logPath, JSON.stringify(entry) + "\n", "utf-8")
      } catch {
        // silently fail — debug should never break the app
      }
    }
  }

  end(result: Record<string, unknown> = {}): void {
    if (!IS_DEBUG || !this.started) return

    this.log("session_end", {
      totalSteps: this.entries.length,
      ...result,
    })

    // Write final summary
    if (this.logPath) {
      try {
        const summary = {
          sessionId: this.sessionId,
          startedAt: this.entries[0]?.timestamp,
          endedAt: new Date().toISOString(),
          totalSteps: this.entries.length,
          steps: this.entries,
        }
        fs.writeFileSync(
          this.logPath.replace(".json", "-summary.json"),
          JSON.stringify(summary, null, 2),
          "utf-8",
        )
        console.log(`[debug-log] Session saved to ${this.logPath.replace(".json", "-summary.json")}`)
      } catch {
        // silent
      }
    }

    this.started = false
  }
}

export const debugLog = new DebugLog()

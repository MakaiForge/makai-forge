import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { app } from "electron";
import { getVenvPythonPath } from "@prefix/core/venv";
import { db, gamesStore, storeKeys } from "@main/store";
import type { WineTool, WineToolResult } from "./types";
import { logger } from "@main/services";
import { logsPath } from "@main/constants";

export class WineToolRunner {
  private prefix: string;
  private objectId: string;
  private protonPath: string | null;

  constructor(prefix: string, objectId: string, protonPath?: string | null) {
    this.prefix = prefix;
    this.objectId = objectId;
    this.protonPath = protonPath || null;
  }

  private getUmuBinaryPath(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, "umu-run")
      : path.join(__dirname, "..", "..", "resources", "binaries", "umu-run");
  }

  private spawnNativeTool(toolName: string, toolArgs: string[]): boolean {
    if (!this.protonPath) return false;
    const nativePath = path.join(this.protonPath, "dist", "bin", toolName);
    if (!fs.existsSync(nativePath)) return false;

    const env: Record<string, string | undefined> = {
      ...process.env,
      WINEPREFIX: this.prefix,
    };

    logger.info("Running wine tool (native)", {
      nativePath,
      toolArgs,
      prefix: this.prefix,
    });

    const child = spawn(nativePath, toolArgs, {
      detached: true,
      stdio: "ignore",
      env,
      cwd: this.prefix,
    });
    child.unref();
    return true;
  }

  private spawnWithUmu(args: string[]): void {
    const umuBinary = this.getUmuBinaryPath();

    if (!fs.existsSync(umuBinary)) {
      logger.error("umu-run not found", { umuBinary });
      return;
    }

    const pythonPath = getVenvPythonPath();
    const executableToSpawn = pythonPath ?? umuBinary;
    const executableArgs = pythonPath
      ? [umuBinary, ...args]
      : args;

    const env: Record<string, string | undefined> = {
      ...process.env,
      WINEPREFIX: this.prefix,
      GAMEID: `umu-${this.objectId}`,
      STORE: "none",
    };

    if (this.protonPath) {
      env.PROTONPATH = this.protonPath;
    }

    logger.info("Running wine tool (umu-run)", {
      executableToSpawn,
      executableArgs,
      usingPython: !!pythonPath,
      prefix: this.prefix,
    });

    const child = spawn(executableToSpawn, executableArgs, {
      detached: true,
      stdio: "ignore",
      env,
      cwd: this.prefix,
    });
    child.unref();
  }

  private spawnTool(args: string[]): void {
    // Fast path: chamar binário nativo direto (sem Python, sem container)
    if (args.length > 0 && this.spawnNativeTool(args[0], args.slice(1))) {
      return;
    }
    // Fallback: umu-run
    this.spawnWithUmu(args);
  }

  public async runMakaitricks(): Promise<WineToolResult> {
    try {
      this.spawnTool(["Makaitricks", "--gui"]);
      logger.info("Wine tool launched: Makaitricks", { prefix: this.prefix });
      return { success: true };
    } catch (error) {
      logger.error("Failed to run winetricks", { error, prefix: this.prefix });
      return { success: false, error: String(error) };
    }
  }

  public async runTaskmgr(): Promise<WineToolResult> {
    try {
      this.spawnTool(["taskmgr"]);
      logger.info("Wine tool launched: taskmgr", { prefix: this.prefix });
      return { success: true };
    } catch (error) {
      logger.error("Failed to run taskmgr", { error, prefix: this.prefix });
      return { success: false, error: String(error) };
    }
  }

  public async runControl(): Promise<WineToolResult> {
    try {
      this.spawnTool(["control"]);
      logger.info("Wine tool launched: control", { prefix: this.prefix });
      return { success: true };
    } catch (error) {
      logger.error("Failed to run control", { error, prefix: this.prefix });
      return { success: false, error: String(error) };
    }
  }

  public async runRegedit(): Promise<WineToolResult> {
    try {
      this.spawnTool(["regedit"]);
      logger.info("Wine tool launched: regedit", { prefix: this.prefix });
      return { success: true };
    } catch (error) {
      logger.error("Failed to run regedit", { error, prefix: this.prefix });
      return { success: false, error: String(error) };
    }
  }

  public async runWinecfg(): Promise<WineToolResult> {
    try {
      this.spawnTool(["winecfg"]);
      logger.info("Wine tool launched: winecfg", { prefix: this.prefix });
      return { success: true };
    } catch (error) {
      logger.error("Failed to run winecfg", { error, prefix: this.prefix });
      return { success: false, error: String(error) };
    }
  }

  public async runWineconsole(): Promise<WineToolResult> {
    try {
      this.spawnTool(["wineconsole", "cmd.exe"]);
      logger.info("Wine tool launched: wineconsole", { prefix: this.prefix });
      return { success: true };
    } catch (error) {
      logger.error("Failed to run wineconsole", { error, prefix: this.prefix });
      return { success: false, error: String(error) };
    }
  }

  private findTerminal(): string {
    const terminals = [
      process.env.TERMINAL,
      "gnome-terminal",
      "konsole",
      "xfce4-terminal",
      "tilix",
      "kitty",
      "mate-terminal",
      "terminator",
      "urxvt",
      "rxvt",
      "lxterminal",
      "qterminal",
      "termite",
      "alacritty",
      "wezterm",
      "xterm",
    ];
    for (const terminal of terminals) {
      if (terminal && fs.existsSync(`/usr/bin/${terminal}`)) {
        return terminal;
      }
    }
    return "xterm";
  }

  public async runTerminal(): Promise<WineToolResult> {
    try {
      const terminal = this.findTerminal();
      const child = spawn(terminal, [], {
        detached: true,
        stdio: "ignore",
        cwd: this.prefix,
        env: {
          ...process.env,
          WINEPREFIX: this.prefix,
        },
      });
      child.unref();

      logger.info("Wine tool launched: terminal", { prefix: this.prefix });
      return { success: true };
    } catch (error) {
      logger.error("Failed to run terminal", { error, prefix: this.prefix });
      return { success: false, error: String(error) };
    }
  }

  public async runExe(exePath?: string): Promise<WineToolResult> {
    try {
      const exe = exePath || "cmd.exe";
      logger.info("Run exe called", { prefix: this.prefix, exe });
      this.spawnTool([exe]);
      logger.info("Wine tool launched: runexe", { prefix: this.prefix });
      return { success: true };
    } catch (error) {
      logger.error("Failed to run exe", { error, prefix: this.prefix });
      return { success: false, error: String(error) };
    }
  }

  public async runWineLog(): Promise<WineToolResult> {
    try {
      const home = os.homedir();
      const logPaths = [
        path.join(logsPath, "info.txt"),
        path.join(logsPath, "logs.txt"),
        path.join(logsPath, "umu.log"),
        path.join(home, `steam-umu-${this.objectId}.log`),
        path.join(home, `steam-${this.objectId}.log`),
        path.join(logsPath, `${this.objectId}.log`),
      ];

      let logFile: string | null = null;
      for (const lp of logPaths) {
        if (fs.existsSync(lp)) {
          logFile = lp;
          break;
        }
      }

      if (!logFile) {
        const logDir = logsPath;
        if (fs.existsSync(logDir)) {
          const files = fs.readdirSync(logDir)
            .filter(f => f.endsWith(".log") || f.endsWith(".txt"))
            .sort((a, b) => {
              const aTime = fs.statSync(path.join(logDir, a)).mtimeMs;
              const bTime = fs.statSync(path.join(logDir, b)).mtimeMs;
              return bTime - aTime;
            })
            .map(f => path.join(logDir, f));
          if (files.length > 0) {
            logFile = files[0];
          }
        }
      }

      if (!logFile) {
        return {
          success: false,
          error: `Nenhum log encontrado.\nLocais procurados:\n  ${logPaths.join("\n  ")}`,
        };
      }

      const terminal = this.findTerminal();
      const termName = path.basename(terminal);
      const isKitty = termName.includes("kitty");
      const isWezterm = termName.includes("wezterm");

      let args: string[];
      if (isKitty) {
        args = ["sh", "-c", `tail -f "${logFile}"`];
      } else if (isWezterm) {
        args = ["start", "--", "tail", "-f", logFile];
      } else {
        args = ["-e", `tail -f "${logFile}"`];
      }

      spawn(terminal, args, {
        detached: true,
        stdio: "ignore",
      });

      logger.info("Wine log opened with tail -f", { path: logFile, terminal });
      return { success: true };
    } catch (error) {
      logger.error("Failed to open wine log", { error, prefix: this.prefix });
      return { success: false, error: String(error) };
    }
  }

  public async run(tool: WineTool): Promise<WineToolResult> {
    switch (tool) {
      case "winetricks":
        return this.runMakaitricks();
      case "taskmgr":
        return this.runTaskmgr();
      case "control":
        return this.runControl();
      case "regedit":
        return this.runRegedit();
      case "winecfg":
        return this.runWinecfg();
      case "wineconsole":
        return this.runWineconsole();
      case "terminal":
        return this.runTerminal();
      case "runexe":
        return this.runExe();
      case "winelog":
        return this.runWineLog();
      default:
        logger.error("Unknown wine tool", { tool });
        return { success: false, error: "Unknown tool" };
    }
  }
}

export async function createWineToolRunner(options: {
  shop: string;
  objectId: string;
}): Promise<WineToolRunner> {
  const { shop, objectId } = options;

  // Steam games store configs in settings (steam_config:{appId}) OR in gamesStore (steam:{appId})
  if (shop === "steam") {
    const appId = objectId.replace(/^steam_/, "");
    const config = await db.get(`steam_config:${appId}`, { valueEncoding: "json" }).catch(() => null);
    const gameFromStore = await gamesStore.get(storeKeys.game("steam", appId)).catch(() => null);

    const prefix = config?.winePrefixPath || gameFromStore?.winePrefixPath;
    if (!prefix) {
      throw new Error(`No wine prefix configured for game: ${objectId}`);
    }

    // Use protonPath from steam_config if available, otherwise from gamesStore
    const protonPath = config?.protonPath || gameFromStore?.protonVersion;
    return new WineToolRunner(prefix, objectId, protonPath);
  }

  const gameKey = storeKeys.game(shop as any, objectId);
  const game = await gamesStore.get(gameKey).catch(() => null);

  if (!game) {
    throw new Error(`Game not found: ${objectId}`);
  }

  const prefix = game.winePrefixPath;

  if (!prefix) {
    throw new Error(`No wine prefix configured for game: ${objectId}`);
  }

  return new WineToolRunner(prefix, objectId, game.protonPath);
}

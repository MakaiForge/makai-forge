import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { app } from "electron";
import { is } from "@electron-toolkit/utils";
import { logsPath } from "@main/constants";
import { logger } from "@main/services/logger";
import { resolveLaunchCommand } from "@main/helpers/resolve-launch-command";

const MAKAI_TIME_MODULE = "tools/prefix/makai_time/makai_time.py";

const getMakaiTimePath = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, MAKAI_TIME_MODULE)
    : path.join(__dirname, "..", "..", "..", MAKAI_TIME_MODULE);

const getMakaiLogPath = () => path.join(logsPath, "makai-time.log");

function getVenvPython(): string | null {
  const candidates = [
    path.join(__dirname, "..", "..", "..", "tools", "venv", "bin", "python3"),
    path.join(app.getPath("userData"), "venv", "bin", "python3"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return "python3";
}

export class MakaiTime {
  public static async runExecutable(
    executablePath: string,
    options?: {
      winePrefixPath?: string | null;
      protonPath?: string | null;
      gameId?: string | null;
      launchOptions?: string | null;
      useGamemode?: boolean;
      useMangohud?: boolean;
      customEnv?: Record<string, string>;
      onLog?: (line: string) => void;
    }
  ): Promise<void> {
    const workingDirectory = path.dirname(executablePath);
    const makaiPath = getMakaiTimePath();
    const logPath = getMakaiLogPath();
    const pythonPath = getVenvPython();

    const args: string[] = [
      makaiPath,
      "--game-exe", executablePath,
      "--proton-path", options?.protonPath ?? "",
      "--prefix-path", options?.winePrefixPath ?? "",
      "--game-path", workingDirectory,
    ];

    if (options?.launchOptions) {
      args.push("--profile", options.launchOptions);
    }

    if (options?.customEnv) {
      for (const [key, value] of Object.entries(options.customEnv)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    const resolvedLaunchCommand = resolveLaunchCommand({
      baseCommand: pythonPath,
      baseArgs: args,
      wrapperCommands: [...(options?.useGamemode ? ["gamemoderun"] : [])],
    });

    fs.mkdirSync(path.dirname(logPath), { recursive: true });

    const launchHeader =
      `\n[${new Date().toISOString()}] Launching with Makai Time\n` +
      `Command: ${[resolvedLaunchCommand.command, ...resolvedLaunchCommand.args].join(" ")}\n`;
    fs.appendFileSync(logPath, launchHeader);

    logger.info("Launching game with Makai Time", {
      command: resolvedLaunchCommand.command,
      args: resolvedLaunchCommand.args,
      cwd: workingDirectory,
      logPath,
    });

    const QUICK_EXIT_THRESHOLD_MS = 3000;
    const onLog = options?.onLog;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finalize = (callback: () => void) => {
        if (settled) return;
        settled = true;
        callback();
      };

      const child = spawn(
        resolvedLaunchCommand.command,
        resolvedLaunchCommand.args,
        {
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
          cwd: workingDirectory,
          env: { ...process.env },
        }
      );

      if (onLog) {
        const rlStdout = readline.createInterface({ input: child.stdout!, crlfDelay: Infinity });
        rlStdout.on("line", (line) => {
          fs.appendFileSync(logPath, line + "\n");
          onLog(line);
        });
        const rlStderr = readline.createInterface({ input: child.stderr!, crlfDelay: Infinity });
        rlStderr.on("line", (line) => {
          fs.appendFileSync(logPath, line + "\n");
          onLog(line);
        });
      } else {
        const logFd = fs.openSync(logPath, "a");
        const rlStdout = readline.createInterface({ input: child.stdout!, crlfDelay: Infinity });
        rlStdout.on("line", (line) => fs.writeSync(logFd, line + "\n"));
        const rlStderr = readline.createInterface({ input: child.stderr!, crlfDelay: Infinity });
        rlStderr.on("line", (line) => fs.writeSync(logFd, line + "\n"));
        child.once("exit", () => { rlStdout.close(); rlStderr.close(); fs.closeSync(logFd); });
        child.once("error", () => { rlStdout.close(); rlStderr.close(); fs.closeSync(logFd); });
      }

      let quickExitTimer: NodeJS.Timeout | null = null;

      child.once("spawn", () => {
        quickExitTimer = setTimeout(() => {
          finalize(() => { child.unref(); resolve(); });
        }, QUICK_EXIT_THRESHOLD_MS);
      });

      child.once("exit", (code, signal) => {
        if (quickExitTimer) { clearTimeout(quickExitTimer); quickExitTimer = null; }
        finalize(() => {
          reject(new Error(
            `Makai Time exited early with code=${code ?? "null"} signal=${signal ?? "null"}`
          ));
        });
      });

      child.once("error", (error) => {
        if (quickExitTimer) { clearTimeout(quickExitTimer); quickExitTimer = null; }
        finalize(() => reject(error));
      });
    });
  }

  public static async runInstaller(
    executablePath: string,
    launchParameters: string[] = [],
    options?: {
      winePrefixPath?: string | null;
      protonPath?: string | null;
      gameId?: string | null;
      launchOptions?: string | null;
      useMangohud?: boolean;
      useGamemode?: boolean;
      customEnv?: Record<string, string>;
      onLog?: (line: string) => void;
      wineDebug?: string;
    }
  ): Promise<{ exitCode: number | null; signal: string | null; exitTimestamp: number }> {
    const workingDirectory = path.dirname(executablePath);
    const makaiPath = getMakaiTimePath();
    const logPath = getMakaiLogPath();
    const pythonPath = getVenvPython();

    const args: string[] = [
      makaiPath,
      "--game-exe", executablePath,
      "--proton-path", options?.protonPath ?? "",
      "--prefix-path", options?.winePrefixPath ?? "",
      "--game-path", workingDirectory,
    ];

    if (options?.customEnv) {
      for (const [key, value] of Object.entries(options.customEnv)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    const resolvedLaunchCommand = resolveLaunchCommand({
      baseCommand: pythonPath,
      baseArgs: args,
      launchOptions: options?.launchOptions,
      wrapperCommands: [...(options?.useGamemode ? ["gamemoderun"] : [])],
    });

    fs.mkdirSync(path.dirname(logPath), { recursive: true });

    const launchHeader =
      `\n[${new Date().toISOString()}] Launching installer with Makai Time\n` +
      `Command: ${[resolvedLaunchCommand.command, ...resolvedLaunchCommand.args].join(" ")}\n`;
    fs.appendFileSync(logPath, launchHeader);

    logger.info("Launching installer with Makai Time (waiting for exit)", {
      command: resolvedLaunchCommand.command,
      cwd: workingDirectory,
      logPath,
    });

    const onLog = options?.onLog;

    return await new Promise<{ exitCode: number | null; signal: string | null; exitTimestamp: number }>((resolve) => {
      const shouldPipeToTerminal = is.dev;

      const child = spawn(
        resolvedLaunchCommand.command,
        resolvedLaunchCommand.args,
        {
          detached: true,
          stdio: shouldPipeToTerminal ? "inherit" : ["ignore", "pipe", "pipe"],
          shell: false,
          cwd: workingDirectory,
          env: { ...process.env },
        }
      );

      if (!shouldPipeToTerminal && onLog) {
        const rlStdout = readline.createInterface({ input: child.stdout!, crlfDelay: Infinity });
        rlStdout.on("line", (line) => { fs.appendFileSync(logPath, line + "\n"); onLog(line); });
        const rlStderr = readline.createInterface({ input: child.stderr!, crlfDelay: Infinity });
        rlStderr.on("line", (line) => { fs.appendFileSync(logPath, line + "\n"); onLog(line); });
      } else if (!shouldPipeToTerminal) {
        const logFd = fs.openSync(logPath, "a");
        const rlStdout = readline.createInterface({ input: child.stdout!, crlfDelay: Infinity });
        rlStdout.on("line", (line) => fs.writeSync(logFd, line + "\n"));
        const rlStderr = readline.createInterface({ input: child.stderr!, crlfDelay: Infinity });
        rlStderr.on("line", (line) => fs.writeSync(logFd, line + "\n"));
        child.once("exit", () => { rlStdout.close(); rlStderr.close(); fs.closeSync(logFd); });
        child.once("error", () => { rlStdout.close(); rlStderr.close(); fs.closeSync(logFd); });
      }

      child.once("exit", (exitCode, signal) => {
        const exitTimestamp = Date.now();
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] Installer exited code=${exitCode} signal=${signal}\n`);
        resolve({ exitCode, signal, exitTimestamp });
      });

      child.once("error", (error) => {
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] Failed: ${String(error)}\n`);
        resolve({ exitCode: -1, signal: null, exitTimestamp: Date.now() });
      });
    });
  }
}

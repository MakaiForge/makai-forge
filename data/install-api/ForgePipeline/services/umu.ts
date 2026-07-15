import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { app } from "electron";
import { is } from "@electron-toolkit/utils";
import { SystemPath } from "@main/services/system-path";
import { logsPath } from "@main/constants";
import { logger } from "@main/services/logger";
import type { ProtonVersion } from "@types";
import { resolveLaunchCommand } from "@main/helpers/resolve-launch-command";
import { ensureVenv } from "@bootstrap/venv";
import { findToolByFolder } from "@proton/main/services/tools";
import { getVenvPythonPath } from "@prefix/core/venv";

const isValidProtonDirectory = (directoryPath: string) => {
  const protonFilePath = path.join(directoryPath, "proton");

  return fs.existsSync(protonFilePath);
};

const isProtonTool = (name: string) =>
  findToolByFolder(name) !== undefined;

const getVersionName = (directoryPath: string) => {
  return path.basename(directoryPath);
};

const getUmuLogPath = () => path.join(logsPath, "umu.log");

const getUmuBinaryPath = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, "umu-run")
    : path.join(__dirname, "..", "..", "resources", "binaries", "umu-run");


const getCompatiblePythonPath = (): string | null => {
  return getVenvPythonPath();
};

const ensureExecutablePermission = (binaryPath: string) => {
  try {
    const currentMode = fs.statSync(binaryPath).mode;
    const hasAnyExecuteBit = (currentMode & 0o111) !== 0;

    if (!hasAnyExecuteBit) {
      fs.chmodSync(binaryPath, 0o755);
    }
  } catch (error) {
    logger.warn("Failed to ensure umu-run executable permission", {
      binaryPath,
      error,
    });
  }
};

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export class Umu {
  public static isValidProtonPath(protonPath: string) {
    return isValidProtonDirectory(protonPath);
  }

  public static async getInstalledProtonVersions(): Promise<ProtonVersion[]> {
    const homePath = SystemPath.getPath("home");

    const compatibilityToolsPath = path.join(
      homePath,
      ".steam",
      "steam",
      "compatibilitytools.d"
    );
    const systemCompatibilityToolsPath = path.join(
      "/usr",
      "share",
      "steam",
      "compatibilitytools.d"
    );
    const appCompatToolsPath = path.join(
      app.getPath("userData"),
      "compat-tools",
      "compatibilitytools.d"
    );

    const versions: ProtonVersion[] = [];

    const compatibilityToolPaths = [
      compatibilityToolsPath,
      systemCompatibilityToolsPath,
      appCompatToolsPath,
    ];

    for (const compatibilityToolPath of compatibilityToolPaths) {
      if (!fs.existsSync(compatibilityToolPath)) {
        continue;
      }

      const compatibilityToolEntries = await fs.promises.readdir(
        compatibilityToolPath,
        {
          withFileTypes: true,
        }
      );

      for (const entry of compatibilityToolEntries) {
        if (!entry.isDirectory()) {
          continue;
        }

        if (!isProtonTool(entry.name)) {
          continue;
        }

        const candidatePath = path.join(compatibilityToolPath, entry.name);

        if (!isValidProtonDirectory(candidatePath)) {
          continue;
        }

        const realPath = await fs.promises.realpath(candidatePath);

        versions.push({
          name: getVersionName(realPath),
          path: realPath,
          source: "compatibility_tools",
          isInstalled: true,
        });
      }
    }

    const uniqueVersions = new Map<string, ProtonVersion>();

    for (const version of versions) {
      uniqueVersions.set(version.path, version);
    }

    return Array.from(uniqueVersions.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  public static async launchInstaller(
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
    await ensureVenv();
    const workingDirectory = path.dirname(executablePath);
    const umuLogPath = getUmuLogPath();
    const umuBinaryPath = getUmuBinaryPath();
    const pythonPath = getCompatiblePythonPath();
    const executableToSpawn = pythonPath ?? umuBinaryPath;
    const executableArgs = pythonPath
      ? [umuBinaryPath, executablePath, ...launchParameters]
      : [executablePath, ...launchParameters];
    const resolvedLaunchCommand = resolveLaunchCommand({
      baseCommand: executableToSpawn,
      baseArgs: executableArgs,
      launchOptions: options?.launchOptions,
      wrapperCommands: [...(options?.useGamemode ? ["gamemoderun"] : [])],
    });

    fs.mkdirSync(path.dirname(umuLogPath), { recursive: true });
    ensureExecutablePermission(umuBinaryPath);

    const wineDebug = options?.wineDebug;

    const launchEnv = {
      ...(wineDebug ? { WINEDEBUG: wineDebug } : {}),
      ...(options?.gameId ? { GAMEID: `umu-${options.gameId}` } : {}),
      ...(options?.winePrefixPath
        ? { WINEPREFIX: options.winePrefixPath }
        : {}),
      ...(options?.protonPath ? { PROTONPATH: options.protonPath } : {}),
      ...(options?.useMangohud ? { MANGOHUD: "1" } : {}),
      ...resolvedLaunchCommand.env,
      ...options?.customEnv,
    };

    const envCommandPart = Object.entries(launchEnv)
      .map(([key, value]) => `${key}=${shellQuote(value)}`)
      .join(" ");
    const argsCommandPart = resolvedLaunchCommand.args
      .map(shellQuote)
      .join(" ");
    const launchCommand = `${envCommandPart} ${shellQuote(resolvedLaunchCommand.command)}${
      argsCommandPart ? ` ${argsCommandPart}` : ""
    }`;

    const launchHeader =
      `\n[${new Date().toISOString()}] Launching installer with umu-run\n` +
      `Command: ${launchCommand}\n`;
    fs.appendFileSync(umuLogPath, launchHeader);

    logger.info("Launching installer with umu-run (waiting for exit)", {
      command: launchCommand,
      umuBinaryPath,
      pythonPath,
      cwd: workingDirectory,
      env: launchEnv,
      umuLogPath,
    });

    const onLog = options?.onLog;

    return await new Promise<{ exitCode: number | null; signal: string | null; exitTimestamp: number }>((resolve) => {
      const shouldPipeToTerminal = is.dev;

      const child = spawn(
        resolvedLaunchCommand.command,
        resolvedLaunchCommand.args,
        {
          detached: true,
          stdio: shouldPipeToTerminal
            ? "inherit"
            : ["ignore", "pipe", "pipe"],
          shell: false,
          cwd: workingDirectory,
          env: {
            ...process.env,
            ...launchEnv,
          },
        }
      );

      if (!shouldPipeToTerminal && onLog) {
        const rlStdout = readline.createInterface({ input: child.stdout!, crlfDelay: Infinity });
        rlStdout.on("line", (line) => {
          fs.appendFileSync(umuLogPath, line + "\n");
          onLog(line);
        });
        const rlStderr = readline.createInterface({ input: child.stderr!, crlfDelay: Infinity });
        rlStderr.on("line", (line) => {
          fs.appendFileSync(umuLogPath, line + "\n");
          onLog(line);
        });
      } else if (!shouldPipeToTerminal) {
        const logFileDescriptor = fs.openSync(umuLogPath, "a");
        const rlStdout = readline.createInterface({ input: child.stdout!, crlfDelay: Infinity });
        rlStdout.on("line", (line) => fs.writeSync(logFileDescriptor, line + "\n"));
        const rlStderr = readline.createInterface({ input: child.stderr!, crlfDelay: Infinity });
        rlStderr.on("line", (line) => fs.writeSync(logFileDescriptor, line + "\n"));

        child.once("exit", () => {
          rlStdout.close();
          rlStderr.close();
          fs.closeSync(logFileDescriptor);
        });
        child.once("error", () => {
          rlStdout.close();
          rlStderr.close();
          fs.closeSync(logFileDescriptor);
        });
      }

      logger.info(`Installer spawned with PID: ${child.pid}`);
      const pidMsg = `[${new Date().toISOString()}] Installer PID: ${child.pid}\n`;
      fs.appendFileSync(umuLogPath, pidMsg);

      child.once("exit", (exitCode, signal) => {
        const exitTimestamp = Date.now();
        const exitMsg = `[${new Date().toISOString()}] Installer exited with code=${exitCode} signal=${signal}\n`;
        fs.appendFileSync(umuLogPath, exitMsg);
        logger.info(`Installer exited: code=${exitCode} signal=${signal}`);
        resolve({ exitCode, signal, exitTimestamp });
      });

      child.once("error", (error) => {
        const errMsg = `[${new Date().toISOString()}] Failed to spawn installer: ${String(error)}\n`;
        fs.appendFileSync(umuLogPath, errMsg);
        logger.error("Failed to spawn installer", error);
        resolve({ exitCode: -1, signal: null, exitTimestamp: Date.now() });
      });
    });
  }

  public static async launchExecutable(
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
  ): Promise<void> {
    await ensureVenv();
    const QUICK_EXIT_THRESHOLD_MS = 3000;
    const workingDirectory = path.dirname(executablePath);
    const umuLogPath = getUmuLogPath();
    const umuBinaryPath = getUmuBinaryPath();
    const pythonPath = getCompatiblePythonPath();
    const executableToSpawn = pythonPath ?? umuBinaryPath;
    const executableArgs = pythonPath
      ? [umuBinaryPath, executablePath, ...launchParameters]
      : [executablePath, ...launchParameters];
    const resolvedLaunchCommand = resolveLaunchCommand({
      baseCommand: executableToSpawn,
      baseArgs: executableArgs,
      launchOptions: options?.launchOptions,
      wrapperCommands: [...(options?.useGamemode ? ["gamemoderun"] : [])],
    });

    fs.mkdirSync(path.dirname(umuLogPath), { recursive: true });
    ensureExecutablePermission(umuBinaryPath);

    const wineDebug = options?.wineDebug;

    const launchEnv = {
      ...(wineDebug ? { WINEDEBUG: wineDebug } : {}),
      ...(options?.gameId ? { GAMEID: `umu-${options.gameId}` } : {}),
      ...(options?.winePrefixPath
        ? { WINEPREFIX: options.winePrefixPath }
        : {}),
      ...(options?.protonPath ? { PROTONPATH: options.protonPath } : {}),
      ...(options?.useMangohud ? { MANGOHUD: "1" } : {}),
      ...resolvedLaunchCommand.env,
      ...options?.customEnv,
    };

    const envCommandPart = Object.entries(launchEnv)
      .map(([key, value]) => `${key}=${shellQuote(value)}`)
      .join(" ");
    const argsCommandPart = resolvedLaunchCommand.args
      .map(shellQuote)
      .join(" ");
    const launchCommand = `${envCommandPart} ${shellQuote(resolvedLaunchCommand.command)}${
      argsCommandPart ? ` ${argsCommandPart}` : ""
    }`;

    const launchHeader =
      `\n[${new Date().toISOString()}] Launching with umu-run\n` +
      `Command: ${launchCommand}\n`;

    fs.appendFileSync(umuLogPath, launchHeader);

    logger.info("Launching game with umu-run", {
      command: launchCommand,
      umuBinaryPath,
      pythonPath,
      cwd: workingDirectory,
      env: launchEnv,
      umuLogPath,
    });

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
          env: {
            ...process.env,
            ...launchEnv,
          },
        }
      );

      if (onLog) {
        const rlStdout = readline.createInterface({ input: child.stdout!, crlfDelay: Infinity });
        rlStdout.on("line", (line) => {
          fs.appendFileSync(umuLogPath, line + "\n");
          onLog(line);
        });
        const rlStderr = readline.createInterface({ input: child.stderr!, crlfDelay: Infinity });
        rlStderr.on("line", (line) => {
          fs.appendFileSync(umuLogPath, line + "\n");
          onLog(line);
        });
      } else {
        const logFileDescriptor = fs.openSync(umuLogPath, "a");
        const rlStdout = readline.createInterface({ input: child.stdout!, crlfDelay: Infinity });
        rlStdout.on("line", (line) => fs.writeSync(logFileDescriptor, line + "\n"));
        const rlStderr = readline.createInterface({ input: child.stderr!, crlfDelay: Infinity });
        rlStderr.on("line", (line) => fs.writeSync(logFileDescriptor, line + "\n"));

        child.once("exit", () => {
          rlStdout.close();
          rlStderr.close();
          if (logFileDescriptor !== null) fs.closeSync(logFileDescriptor);
        });
        child.once("error", () => {
          rlStdout.close();
          rlStderr.close();
          if (logFileDescriptor !== null) fs.closeSync(logFileDescriptor);
        });
      }

      let quickExitTimer: NodeJS.Timeout | null = null;

      child.once("spawn", () => {
        quickExitTimer = setTimeout(() => {
          finalize(() => {
            child.unref();
            resolve();
          });
        }, QUICK_EXIT_THRESHOLD_MS);
      });

      child.once("exit", (code, signal) => {
        if (quickExitTimer) {
          clearTimeout(quickExitTimer);
          quickExitTimer = null;
        }

        finalize(() => {
          const earlyExitError = new Error(
            `umu-run exited early with code=${code ?? "null"} signal=${signal ?? "null"}`
          );
          fs.appendFileSync(
            umuLogPath,
            `[${new Date().toISOString()}] ${earlyExitError.message}\n`
          );
          reject(earlyExitError);
        });
      });

      child.once("error", (error) => {
        if (quickExitTimer) {
          clearTimeout(quickExitTimer);
          quickExitTimer = null;
        }

        finalize(() => {
          fs.appendFileSync(
            umuLogPath,
            `[${new Date().toISOString()}] Failed to spawn umu-run (${resolvedLaunchCommand.command}): ${String(error)}\n`
          );
          reject(error);
        });
      });
    });
  }
}

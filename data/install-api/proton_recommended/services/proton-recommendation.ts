import cp from "node:child_process";
import path from "node:path";
import { app } from "electron";
import { WindowManager } from "@main/services/window-manager";
import { getVenvPython } from "@bootstrap/venv";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout | null;
}

export interface ProtonFork {
  fork: string;
  name: string;
  version: string;
  tier: string;
  tierScore: number;
  confidence: string;
  note?: string;
}

export interface ProtonRecommendation {
  game_id: string;
  title: string;
  primary: ProtonFork | null;
  alternatives: ProtonFork[];
}

export class ProtonRecommendationService {
  private static process: cp.ChildProcess | null = null;
  private static pendingRequests = new Map<number, PendingRequest>();
  private static nextRequestId = 1;
  private static stdoutBuffer = "";
  private static ready = false;
  private static readyPromise: Promise<void> | null = null;
  private static readyResolver: (() => void) | null = null;

  private static get pythonExecutable(): string {
    return getVenvPython();
  }

  private static get scriptPath(): string {
    return path.join(app.getAppPath(), "data", "install-api", "proton_recommended", "python", "server.py");
  }

  static async spawn(): Promise<void> {
    if (this.process) {
      try {
        await this.ensureReady();
        return;
      } catch {
        this.kill();
      }
    }

    this.resetReadyState();
    this.stdoutBuffer = "";

    const child = cp.spawn(this.pythonExecutable, [this.scriptPath, "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      this.stdoutBuffer += chunk.toString();
      this.processStdoutBuffer();
    });

    child.once("error", (err) => {
      this.handleProcessExit(String(err));
    });

    child.once("exit", (code, signal) => {
      this.handleProcessExit(`code=${code} signal=${signal}`);
    });

    this.process = child;
    await this.ensureReady();
  }

  private static resetReadyState() {
    this.ready = false;
    this.readyPromise = new Promise<void>((resolve) => {
      this.readyResolver = resolve;
    });
  }

  private static ensureReady(timeout = 15000): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (!this.readyPromise) return Promise.reject(new Error("Not spawned"));

    return Promise.race([
      this.readyPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Startup timeout")), timeout)
      ),
    ]);
  }

  private static markReady() {
    if (this.ready) return;
    this.ready = true;
    this.readyResolver?.();
    this.readyResolver = null;
  }

  private static processStdoutBuffer() {
    let idx = this.stdoutBuffer.indexOf("\n");
    while (idx >= 0) {
      const line = this.stdoutBuffer.slice(0, idx);
      this.stdoutBuffer = this.stdoutBuffer.slice(idx + 1);
      this.handleLine(line);
      idx = this.stdoutBuffer.indexOf("\n");
    }
  }

  private static handleLine(line: string) {
    const raw = line.trim();
    if (!raw) return;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (parsed.event === "ready") {
      this.markReady();
      return;
    }

    const id = parsed.id as number | undefined;
    if (typeof id !== "number") return;

    const pending = this.pendingRequests.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingRequests.delete(id);

    if (parsed.error) {
      const err = parsed.error as { message?: string };
      pending.reject(new Error(err.message || "RPC error"));
      return;
    }

    pending.resolve(parsed.result);
  }

  private static handleProcessExit(reason: string) {
    const err = new Error(`Process exited: ${reason}`);
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pendingRequests.clear();
    this.ready = false;
    this.readyPromise = null;
    this.readyResolver = null;
    this.stdoutBuffer = "";
    this.process = null;
  }

  static async request<T>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs: number = 30000
  ): Promise<T> {
    if (!this.process) {
      await this.spawn();
    }

    try {
      await this.ensureReady();
    } catch {
      this.kill();
      await this.spawn();
      await this.ensureReady();
    }

    const id = this.nextRequestId++;
    const payload = JSON.stringify({ id, method, params }) + "\n";

    return new Promise<T>((resolve, reject) => {
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              this.pendingRequests.delete(id);
              reject(new Error(`Timeout for '${method}'`));
            }, timeoutMs)
          : null;

      this.pendingRequests.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer: timer as NodeJS.Timeout | null,
      });

      this.process?.stdin?.write(payload);
    });
  }

  static async recommend(gameId: string): Promise<ProtonRecommendation> {
    return this.request<ProtonRecommendation>("recommend_proton", {
      game_id: gameId,
    });
  }

  static async getInstalledForks(): Promise<ProtonFork[]> {
    return this.request<ProtonFork[]>("list_available_forks", {});
  }

  static async createPrefix(
    gameId: string,
    protonPath: string,
    prefixPath?: string
  ): Promise<{
    success: boolean;
    prefix_path: string;
    initialized: boolean;
    dlls_installed: string[];
    errors: string[];
  }> {
    return this.request("create_prefix", {
      game_id: gameId,
      proton_path: protonPath,
      prefix_path: prefixPath,
      auto_dlls: true,
    });
  }

  static async getRecommendedDlls(
    gameId: string
  ): Promise<{
    game_id: string;
    essenciais: Record<string, unknown>[];
    opcionais: Record<string, unknown>[];
    diagnostico: Record<string, unknown>;
  }> {
    return this.request("get_recommended_dlls", {
      game_id: gameId,
    });
  }

  static async installGameDlls(
    gameId: string,
    prefixPath: string,
    protonPath: string,
    extraVerbs?: string[],
    makaitricksPath?: string | null
  ): Promise<{
    installed: string[];
    errors: string[];
  }> {
    const params: Record<string, unknown> = {
      game_id: gameId,
      prefix_path: prefixPath,
      proton_path: protonPath,
    };
    if (extraVerbs && extraVerbs.length > 0) {
      params.extra_verbs = extraVerbs;
    }
    if (makaitricksPath) {
      params.makaitricks_path = makaitricksPath;
    }

    WindowManager.mainWindow?.webContents.send("on-install-progress", {
      status: "Installing dependencies...",
      percent: 10,
    });
    try {
      return await this.request("install_game_dlls", params, 0);
    } finally {
      WindowManager.mainWindow?.webContents.send("on-install-progress", {
        status: "Dependencies installed",
        percent: 100,
      });
    }
  }

  static async runMakaitricks(
    prefixPath: string,
    protonPath: string,
    verbs: string[],
    makaitricksPath?: string | null
  ): Promise<{
    installed: string[];
    errors: string[];
  }> {
    const params: Record<string, unknown> = {
      prefix_path: prefixPath,
      proton_path: protonPath,
      verbs,
    };
    if (makaitricksPath) {
      params.makaitricks_path = makaitricksPath;
    }
    return this.request("install-makaitricks", params, 0);
  }

  static async analyzeExe(
    exePath: string
  ): Promise<{
    success: boolean;
    error?: string;
    type?: string;
    original?: string;
    clean_name?: string;
    game_name?: string | null;
    app?: string;
    protonforge?: Record<string, unknown>;
  }> {
    return this.request("analyze_exe", {
      exe_path: exePath,
    });
  }

  static async getLaunchCommand(
    gameId: string,
    prefixPath: string,
    protonPath: string,
    executable: string,
    launchOptions?: string
  ): Promise<{
    command: string;
    args: string[];
    env_vars: Record<string, string>;
  }> {
    return this.request("get_launch_command", {
      game_id: gameId,
      prefix_path: prefixPath,
      proton_path: protonPath,
      executable,
      launch_options: launchOptions,
    });
  }

  static async checkAntiCheat(
    gameId: string
  ): Promise<{ eac: boolean; battleye: boolean }> {
    return this.request("check_anticheat", {
      game_id: gameId,
    });
  }

  static kill() {
    this.process?.kill();
    this.handleProcessExit("killed");
  }
}

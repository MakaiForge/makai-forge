import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { getVenvPythonPath } from "@prefix/core/venv";

// LOG DE DEBUG: se isso aparecer no terminal, o módulo carregou.
console.log("[ProtonForgeRPC] MODULE LOADED");

let LOG_FILE = "";

function getLogFile(): string {
  if (LOG_FILE) return LOG_FILE;
  LOG_FILE = "/tmp/protonforge-api.log";
  return LOG_FILE;
}

/** Retorna o path do log na pasta da API (pode falhar). */
function getApiLogPath(): string {
  try {
    return path.join(app.getAppPath(), "tools", "python-rpc", "protonforge-api", "log.txt");
  } catch {
    return "";
  }
}

function log(...args: unknown[]) {
  const ts = new Date().toLocaleString("pt-BR");
  const line = `[${ts}] ${args.map(a => String(a)).join(" ")}`;
  console.log("[ProtonForgeRPC]", line);
  const f = getLogFile();
  try { fs.appendFileSync(f, line + "\n"); } catch {}
  // Também tenta escrever na pasta da API
  const api = getApiLogPath();
  if (api && api !== f) {
    try {
      const dir = path.dirname(api);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(api, line + "\n");
    } catch {}
  }
}

type PendingRpc = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout;
};

export class ProtonForgeRPC {
  private static process: cp.ChildProcess | null = null;
  private static pending = new Map<number, PendingRpc>();
  private static nextId = 1;
  private static buf = "";
  private static ready = false;
  private static readyPromise: Promise<void> | null = null;
  private static readyResolve: (() => void) | null = null;

  static async call<T = unknown>(method: string, params?: unknown, timeoutMs = 120_000): Promise<T> {
    log("call", method, "params=" + JSON.stringify(params).slice(0, 200));
    if (!this.process) await this.spawn();
    await this.ensureReady();

    if (!this.process?.stdin) {
      const err = "ProtonForge RPC not available";
      log("call", "FAIL", err);
      throw new Error(err);
    }

    const id = this.nextId++;
    const payload = { id, method, params: params ?? {} };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const msg = `ProtonForge RPC timeout: ${method}`;
        log("call", "TIMEOUT", method);
        reject(new Error(msg));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.process?.stdin?.write(JSON.stringify(payload) + "\n");
    });
  }

  static async spawn(): Promise<void> {
    if (this.process) return;
    this.ready = false;
    this.readyPromise = new Promise<void>((resolve) => { this.readyResolve = resolve; });
    this.buf = "";

    const python = getVenvPythonPath();
    if (!python) {
      const err = "Venv Python não encontrado. Execute 'npm run reinstall' para configurar o ambiente Python.";
      log("spawn", "FAIL", err);
      throw new Error(err);
    }
    const script = path.join(app.getAppPath(), "tools", "python-rpc", "protonforge-api", "server.py");

    log("spawn", "python=" + python, "script=" + script);

    if (!fs.existsSync(script)) {
      const err = `ProtonForge RPC script not found: ${script}`;
      log("spawn", "FAIL", err);
      throw new Error(err);
    }

    log("spawn", "executando server.py --stdio...");

    const child = cp.spawn(python, [script, "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdout?.setEncoding("utf-8");
    child.stdout?.on("data", (chunk: string) => {
      this.buf += chunk;
      this.processBuffer();
    });

    child.stderr?.setEncoding("utf-8");
    child.stderr?.on("data", (chunk: string) => {
      log("stderr", chunk.trim());
      console.error("[ProtonForgeRPC:stderr]", chunk);
    });

    child.on("error", (err) => {
      log("spawn", "ERROR", String(err));
      this.handleExit(String(err));
    });

    child.on("exit", (code, signal) => {
      log("spawn", "EXIT", `code=${code} signal=${signal}`);
      this.handleExit(`code=${code} signal=${signal}`);
    });

    this.process = child;

    try {
      await Promise.race([
        this.readyPromise,
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error("ProtonForge RPC startup timeout")), 10_000)),
      ]);
      log("spawn", "READY");
    } catch (err) {
      log("spawn", "TIMEOUT/ERROR", String(err));
      this.kill();
      throw err;
    }
  }

  private static processBuffer() {
    let nl = this.buf.indexOf("\n");
    while (nl >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (line) this.handleLine(line);
      nl = this.buf.indexOf("\n");
    }
  }

  private static handleLine(line: string) {
    let parsed: any;
    try { parsed = JSON.parse(line); } catch { return; }

    if (parsed.event === "ready") {
      this.ready = true;
      this.readyResolve?.();
      this.readyResolve = null;
      return;
    }

    if (typeof parsed.id !== "number") return;
    const pending = this.pending.get(parsed.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(parsed.id);

    if (parsed.error) {
      pending.reject(new Error(parsed.error.message || parsed.error.code));
    } else {
      pending.resolve(parsed.result);
    }
  }

  private static handleExit(reason: string) {
    log("exit", reason);
    const err = new Error(`ProtonForge RPC exited: ${reason}`);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
    this.ready = false;
    this.readyPromise = null;
    this.readyResolve = null;
    this.process = null;
    this.buf = "";
  }

  private static async ensureReady(timeoutMs = 10_000): Promise<void> {
    if (this.ready) return;
    if (!this.readyPromise) throw new Error("ProtonForge RPC not running");
    await Promise.race([
      this.readyPromise,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error("ProtonForge RPC ready timeout")), timeoutMs)),
    ]);
  }

  static async init(): Promise<void> {
    if (this.process) return;
    log("init", "spawning server.py...");
    try {
      await this.spawn();
      log("init", "ready");
    } catch (err) {
      log("init", "FAILED", String(err));
      console.error("[ProtonForgeRPC] init() — failed:", err);
    }
  }

  /** Copies log.txt do /tmp para o diretório da API. */
  static copyLogToApiDir(): void {
    const src = "/tmp/protonforge-api.log";
    if (!fs.existsSync(src)) return;
    try {
      const dst = path.join(app.getAppPath(), "tools", "python-rpc", "protonforge-api", "log.txt");
      const dir = path.dirname(dst);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.cpSync(src, dst, { force: true });
      console.log("[ProtonForgeRPC] log copied to", dst);
    } catch (e) {
      console.error("[ProtonForgeRPC] copy log failed:", e);
    }
  }

  static kill(): void {
    this.process?.kill();
    this.handleExit("killed");
  }

  static isRunning(): boolean {
    return this.process !== null && this.ready;
  }
}

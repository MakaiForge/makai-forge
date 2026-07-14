/**
 * tools/Mods_manager/services/makai-rpc.ts
 *
 * Bridge RPC unificado entre Electron e core/server.py.
 *
 * Gerencia o subprocesso Python, envia requisições JSON-RPC,
 * recebe respostas e eventos de streaming (progress, log).
 *
 * Protocolo: JSON-lines sobre stdin/stdout com --stdio.
 */

import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { getVenvPythonPath } from "@prefix/core/venv";
import { logger } from "@main/services/logger";

// ─── Types ────────────────────────────────────────────────────

interface PendingRpc {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout;
}

export type RpcEventCallback = (event: string, data: Record<string, unknown>) => void;

interface RpcError {
  code: string;
  message: string;
}

// ─── MakaiRPC ─────────────────────────────────────────────────

export class MakaiRPC {
  private static process: cp.ChildProcess | null = null;
  private static pending = new Map<number, PendingRpc>();
  private static nextId = 1;
  private static buf = "";
  private static ready = false;
  private static readyPromise: Promise<void> | null = null;
  private static readyResolve: (() => void) | null = null;
  private static eventCallbacks: RpcEventCallback[] = [];

  static onEvent(cb: RpcEventCallback): void {
    this.eventCallbacks.push(cb);
  }

  static removeEvent(cb: RpcEventCallback): void {
    this.eventCallbacks = this.eventCallbacks.filter(c => c !== cb);
  }

  static async call<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs = 120_000,
  ): Promise<T> {
    logger.info(`[MakaiRPC] call: ${method}`);
    if (!this.process) await this.spawn();
    await this.ensureReady();

    if (!this.process?.stdin) {
      throw new Error("MakaiRPC not available");
    }

    const id = this.nextId++;
    const payload = { id, method, params: params ?? {} };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MakaiRPC timeout: ${method} (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.process?.stdin?.write(JSON.stringify(payload) + "\n");
    });
  }

  static async spawn(): Promise<void> {
    if (this.process) {
      // Se o processo existe, verifica se está vivo
      if (this.process.exitCode === null) return;
      this.kill();
    }

    this.ready = false;
    this.readyPromise = new Promise<void>((resolve) => { this.readyResolve = resolve; });
    this.buf = "";
    this.pending.clear();

    const python = getVenvPythonPath();
    if (!python) {
      throw new Error(
        "Venv Python não encontrado. Execute 'npm run reinstall' para configurar o ambiente Python.",
      );
    }

    const serverScript = path.join(
      app.getAppPath(), "tools", "Mods_manager", "core", "server.py",
    );

    if (!fs.existsSync(serverScript)) {
      throw new Error(`MakaiRPC server not found: ${serverScript}`);
    }

    logger.info(`[MakaiRPC] spawn: python=${python}, script=${serverScript}`);

    const child = cp.spawn(python, [serverScript, "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdout?.setEncoding("utf-8");
    child.stdout?.on("data", (chunk: string) => {
      this.buf += chunk;
      this.processBuffer();
    });

    child.stderr?.setEncoding("utf-8");
    child.stderr?.on("data", (chunk: string) => {
      logger.warn(`[MakaiRPC:stderr] ${chunk.trim()}`);
    });

    child.on("error", (err) => {
      logger.error(`[MakaiRPC] process error: ${err}`);
      this.handleExit(String(err));
    });

    child.on("exit", (code, signal) => {
      logger.info(`[MakaiRPC] exit: code=${code} signal=${signal}`);
      this.handleExit(`code=${code} signal=${signal}`);
    });

    this.process = child;

    try {
      await Promise.race([
        this.readyPromise,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("MakaiRPC startup timeout")), 10_000)
        ),
      ]);
      logger.info("[MakaiRPC] ready");
    } catch (err) {
      logger.error(`[MakaiRPC] startup failed: ${err}`);
      this.kill();
      throw err;
    }
  }

  static kill(): void {
    this.process?.kill();
    this.handleExit("killed");
  }

  static isRunning(): boolean {
    return this.process !== null && this.ready;
  }

  // ─── Private ──────────────────────────────────────────────

  private static processBuffer(): void {
    let nl = this.buf.indexOf("\n");
    while (nl >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (line) this.handleLine(line);
      nl = this.buf.indexOf("\n");
    }
  }

  private static handleLine(line: string): void {
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }

    // Eventos sem id (progress, ready, log, error)
    if (parsed.event) {
      if (parsed.event === "ready") {
        this.ready = true;
        this.readyResolve?.();
        this.readyResolve = null;
        return;
      }

      // Notifica callbacks de eventos (progresso do play, etc.)
      for (const cb of this.eventCallbacks) {
        try {
          cb(parsed.event, parsed);
        } catch (e) {
          logger.error(`[MakaiRPC] event callback error: ${e}`);
        }
      }
      return;
    }

    // Respostas com id
    if (typeof parsed.id !== "number") return;

    const pending = this.pending.get(parsed.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(parsed.id);

    if (parsed.error) {
      const err: RpcError = parsed.error;
      pending.reject(new Error(`[${err.code}] ${err.message}`));
    } else {
      pending.resolve(parsed.result);
    }
  }

  private static handleExit(reason: string): void {
    const err = new Error(`MakaiRPC exited: ${reason}`);
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
    if (!this.readyPromise) throw new Error("MakaiRPC not running");
    await Promise.race([
      this.readyPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("MakaiRPC ready timeout")), timeoutMs)
      ),
    ]);
  }
}

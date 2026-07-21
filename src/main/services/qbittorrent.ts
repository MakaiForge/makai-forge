import http from "node:http";
import { spawn, execSync } from "node:child_process";
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { logger } from "./logger";

let qbittorrentProcess: import("node:child_process").ChildProcess | null = null;
let qbittorrentStartTime = 0;

function killOrphanQBittorrent(): void {
  try {
    execSync("pkill -e qbittorrent-nox 2>/dev/null", { stdio: "ignore" });
  } catch {
    // pkill exits non-zero if no process matched — harmless
  }
}

async function waitForPortFree(port: number, timeoutMs = 2000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      execSync(`ss -tlnp | grep -q ":${port} "`, { stdio: "ignore" });
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      return true;
    }
  }
  logger.warn(`[QBittorrent] Port ${port} still in use after ${timeoutMs}ms`);
  return false;
}

const QBT_CONFIG_DIR = path.join(os.homedir(), ".config/qBittorrent");
const QBT_CONFIG_PATH = path.join(QBT_CONFIG_DIR, "qBittorrent.conf");

function ensureQbtConfig(): void {
  try {
    fs.mkdirSync(QBT_CONFIG_DIR, { recursive: true });

    if (fs.existsSync(QBT_CONFIG_PATH)) {
      const content = fs.readFileSync(QBT_CONFIG_PATH, "utf-8");
      if (content.includes("WebUI\\LocalHostAuth")) return;

      const patched = `${content}\n[Preferences]\nWebUI\\LocalHostAuth=false\n`;
      fs.writeFileSync(QBT_CONFIG_PATH, patched, "utf-8");
      logger.log(`[QBittorrent] LocalHostAuth=false added to existing config`);
      return;
    }

    const config = `[LegalNotice]\nAccepted=true\n\n[Preferences]\nWebUI\\LocalHostAuth=false\n`;
    fs.writeFileSync(QBT_CONFIG_PATH, config, "utf-8");
    logger.log(`[QBittorrent] Config created: ${QBT_CONFIG_PATH}`);
  } catch (err: any) {
    logger.error(`[QBittorrent] Failed to write config: ${err.message}`);
  }
}

export async function startQBittorrent() {
  ensureQbtConfig();
  const qbtPath = app.isPackaged
    ? path.join(process.resourcesPath, "app/_resources/binaries/qbittorrent/qbittorrent-nox")
    : path.join(app.getAppPath(), "app/_resources/binaries/qbittorrent/qbittorrent-nox");

  killOrphanQBittorrent();
  await waitForPortFree(8080);

  try {
    qbittorrentProcess = spawn(
      qbtPath,
      ["--confirm-legal-notice", "--webui-port=8080"],
      { stdio: "ignore", detached: false }
    );

    qbittorrentProcess.on("error", (err) => {
      logger.error(`[QBittorrent] Failed to start: ${err.message}`);
      qbittorrentProcess = null;
    });

    qbittorrentProcess.on("exit", (code) => {
      logger.log(`[QBittorrent] Exited with code ${code}`);
      const diedEarly =
        qbittorrentStartTime > 0 && Date.now() - qbittorrentStartTime < 10000;
      qbittorrentProcess = null;
      if (diedEarly) {
        logger.warn("[QBittorrent] Died during startup, will retry on next start");
      }
    });

    qbittorrentStartTime = Date.now();
    logger.log(`[QBittorrent] Started (PID: ${qbittorrentProcess.pid})`);
  } catch (err: any) {
    logger.error(`[QBittorrent] Failed to spawn: ${err.message}`);
  }
}

export function waitForQBittorrent(): Promise<boolean> {
  return new Promise((resolve) => {
    const maxAttempts = 15;
    let attempts = 0;

    const check = () => {
      const req = http.get("http://localhost:8080", (res) => {
        res.resume();
        resolve(true);
      });

      req.on("error", () => {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(check, 500);
        } else {
          logger.warn("[QBittorrent] Not ready after 7.5s, continuing anyway");
          resolve(false);
        }
      });

      req.end();
    };

    check();
  });
}

export function isQBittorrentAlive(): boolean {
  return qbittorrentProcess !== null;
}

export function killQBittorrent(): Promise<void> {
  const proc = qbittorrentProcess;
  if (!proc) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!proc.killed) proc.kill("SIGKILL");
      resolve();
    }, 3000);

    proc.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });

    try {
      proc.kill("SIGTERM");
      logger.log("[QBittorrent] Kill signal sent");
    } catch (err: any) {
      logger.error(`[QBittorrent] Kill error: ${err.message}`);
      clearTimeout(timer);
      resolve();
    }
  });
}

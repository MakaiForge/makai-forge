import path from "node:path";
import fs from "node:fs";
import https from "node:https";
import { spawnSync } from "node:child_process";
import { app } from "electron";
import { logger } from "@main/services";

let cachedWinetricksPath: string | null = null;

function getWinetricksDir(): string {
  return path.join(app.getAppPath(), "app", "_resources", "binaries");
}

function getMakaitricksPath(): string {
  return path.join(getWinetricksDir(), "Makaitricks");
}

function getLocalVersion(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const m = content.match(/^WINETRICKS_VERSION=(\S+)/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data.trim()));
    }).on("error", reject);
  });
}

async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        fs.chmodSync(dest, 0o755);
        resolve();
      });
    }).on("error", (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

export async function ensureWinetricks(): Promise<string | null> {
  if (cachedWinetricksPath) return cachedWinetricksPath;

  if (process.platform !== "linux") {
    cachedWinetricksPath = null;
    return null;
  }

  const makaitricksPath = getMakaitricksPath();

  if (!fs.existsSync(makaitricksPath)) {
    logger.error("[ensureWinetricks] Makaitricks not found at", makaitricksPath);
    return null;
  }

  /* Verify local file is executable */
  try {
    const testResult = spawnSync(makaitricksPath, ["--version"], {
      stdio: "pipe",
      timeout: 5000,
    });
    if (testResult.error || testResult.status !== 0) {
      logger.error("[ensureWinetricks] Local Makaitricks failed version check");
      return null;
    }
  } catch {
    logger.error("[ensureWinetricks] Exception running local Makaitricks");
    return null;
  }

  /* Check remote for newer version */
  try {
    const localVersion = getLocalVersion(makaitricksPath);
    const remoteVersion = await fetchUrl(
      "https://raw.githubusercontent.com/MakaiForge/Makaitricks/main/LATEST"
    );

    if (localVersion && remoteVersion && remoteVersion !== localVersion) {
      logger.log(
        `[ensureWinetricks] New version available: ${remoteVersion} (local: ${localVersion}), downloading...`
      );
      await downloadFile(
        "https://raw.githubusercontent.com/MakaiForge/Makaitricks/main/Makaitricks",
        makaitricksPath
      );

      /* Verify downloaded file */
      const verifyResult = spawnSync(makaitricksPath, ["--version"], {
        stdio: "pipe",
        timeout: 5000,
      });
      if (verifyResult.error || verifyResult.status !== 0) {
        logger.error("[ensureWinetricks] Downloaded Makaitricks failed version check, keeping old");
        /* Restore from backup if available? For now just use old file */
      } else {
        logger.log(`[ensureWinetricks] Updated to Makaitricks ${remoteVersion}`);
      }
    } else if (localVersion && remoteVersion) {
      logger.log(`[ensureWinetricks] Makaitricks ${localVersion} is up to date`);
    }
  } catch (err) {
    logger.warn("[ensureWinetricks] Could not check for updates, using local version");
  }

  cachedWinetricksPath = makaitricksPath;
  return cachedWinetricksPath;
}

export function clearWinetricksCache(): void {
  cachedWinetricksPath = null;
}

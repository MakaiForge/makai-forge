import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
import { app } from "electron";
import { logger } from "@main/services/logger";
import { WindowManager } from "@main/services/window-manager";

const METADATA_MIRRORS = [
  `https://raw.githubusercontent.com/MakaiForge/the-bootstrap/main/resonance.json`,
  `https://gitlab.com/api/v4/projects/83110951/repository/files/resonance.json/raw`,
];

interface ResourceEntry {
  version: number;
  tag: string;
  sha256: string;
  size: number;
  original_size: number;
  archive: string;
  github_repo: string;
  gitlab_project_id: number;
}

interface Metadata {
  version: number;
  components: Record<string, ResourceEntry>;
}

const KNOWN_RESOURCES = [
  "bootstrap.tar.gz",
  "installer-api.tar.gz",
  "proton_data.db.gz",
  "fork_catalog.db.gz",

  "releases.tar.gz",
];

function getLocalMetadataPath(): string {
  return path.join(app.getPath("userData"), "resources", "resonance.json");
}

function getAutoUpdatePath(): string {
  return path.join(app.getPath("userData"), "bootstrap.json");
}

function isAutoUpdateEnabled(): boolean {
  try {
    const raw = fs.readFileSync(getAutoUpdatePath(), "utf-8");
    const config = JSON.parse(raw);
    return config.auto_update !== 0;
  } catch {
    return true;
  }
}

function getUserDataDir(): string {
  return path.join(app.getPath("userData"), "resources");
}

function getMirrorUrls(entry: ResourceEntry, filename: string): string[] {
  return [
    `https://github.com/${entry.github_repo}/releases/download/${entry.tag}/${filename}`,
    `https://gitlab.com/api/v4/projects/${entry.gitlab_project_id}/packages/generic/${entry.github_repo.split('/')[1]}/v1.0.0/${filename}`,
  ];
}

function sendProgress(status: string, percent: number, detail?: string) {
  const target = WindowManager.setupWindow || WindowManager.mainWindow;
  target?.webContents.send("on-resource-progress", { status, percent, detail });
}

function downloadFile(urls: string[], destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    let lastErr: Error | null = null;
    let idx = 0;

    function tryNext() {
      if (idx >= urls.length) {
        return reject(lastErr || new Error("All mirrors failed"));
      }

      const url = urls[idx++];
      logger.info(`[resources] Downloading from ${url}`);

      const child = cp.spawn("curl", ["-L", "-f", "-o", destPath, url], {
        stdio: "pipe", timeout: 300000,
      });

      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          try { fs.rmSync(destPath); } catch {}
          lastErr = new Error(`curl exit code ${code} for ${url}`);
          tryNext();
        }
      });

      child.on("error", (err) => {
        try { fs.rmSync(destPath); } catch {}
        lastErr = err;
        tryNext();
      });
    }

    tryNext();
  });
}

function sha256File(filePath: string): string {
  const result = cp.spawnSync("sha256sum", [filePath], { stdio: "pipe", timeout: 30000 });
  if (result.status !== 0) return "";
  return result.stdout.toString().split(" ")[0];
}

function fetchMetadata(): Promise<Metadata | null> {
  return new Promise((resolve) => {
    const tmpPath = path.join(app.getPath("userData"), "resources", "resonance.tmp.json");
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });

    downloadFile(METADATA_MIRRORS, tmpPath)
      .then(() => {
        const raw = fs.readFileSync(tmpPath, "utf-8");
        const meta: Metadata = JSON.parse(raw);
        fs.renameSync(tmpPath, getLocalMetadataPath());
        resolve(meta);
      })
      .catch((err) => {
        logger.warn(`[resources] Failed to fetch remote metadata: ${err}`);
        try { fs.rmSync(tmpPath); } catch {}
        resolve(null);
      });
  });
}

function loadLocalMetadata(): Metadata | null {
  const metaPath = getLocalMetadataPath();
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  } catch {
    return null;
  }
}

function getResourceOutputPath(resourceName: string): string {
  const resourcesDir = getResourceDir();
  if (resourceName === "releases.tar.gz") return path.join(resourcesDir, "data", "releases");
  if (resourceName === "bootstrap.tar.gz") return path.join(resourcesDir, "bootstrap");
  if (resourceName === "installer-api.tar.gz") return path.join(resourcesDir, "installer-api", "index.js");
  if (resourceName === "proton_data.db.gz") return path.join(resourcesDir, "database", "proton_data.db");
  if (resourceName === "fork_catalog.db.gz") return path.join(resourcesDir, "database", "fork_catalog.db");
  if (resourceName === "catalogo.db.gz") return path.join(resourcesDir, "database", "catalogo.db");

  return "";
}

function needsUpdate(resourceName: string, remoteEntry: ResourceEntry, localMeta: Metadata | null): boolean {
  if (!localMeta) return true;
  const localEntry = Object.values(localMeta.components).find(e => e.archive === resourceName);
  if (!localEntry) return true;
  if (localEntry.version < remoteEntry.version) return true;
  const outputPath = getResourceOutputPath(resourceName);
  if (outputPath && !fs.existsSync(outputPath)) return true;
  return false;
}

function getDownloadPath(filename: string): string {
  return path.join(app.getPath("userData"), "resources", ".cache", filename);
}

function getResourceDir(): string {
  return path.join(app.getPath("userData"), "resources");
}

function extractGz(gzPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outputPath);
    fs.mkdirSync(dir, { recursive: true });

    const child = cp.spawn("gzip", ["-d", "-c", gzPath], { stdio: "pipe", timeout: 120000 });
    const out = fs.createWriteStream(outputPath);
    child.stdout.pipe(out);

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`gzip exit code ${code}`));
    });
    child.on("error", reject);
  });
}

function extractTarGz(tarPath: string, outputDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outputDir, { recursive: true });
    const child = cp.spawn("tar", ["-xzf", tarPath, "-C", outputDir], {
      stdio: "pipe",
      timeout: 60000,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exit code ${code}`));
    });
    child.on("error", reject);
  });
}

export async function ensureResources(): Promise<boolean> {
  if (!isAutoUpdateEnabled()) {
    logger.info("[resources] Auto-update disabled via bootstrap.json (auto_update=0)");
    return fs.existsSync(getProtonDataPath());
  }

  sendProgress("checking", 0, "Verificando recursos...");

  const remoteMeta = await fetchMetadata();
  const localMeta = loadLocalMetadata();

  if (!remoteMeta) {
    logger.info("[resources] No remote metadata available, using local if present");
    return fs.existsSync(getProtonDataPath());
  }

  const resourcesDir = getResourceDir();
  fs.mkdirSync(path.join(resourcesDir, ".cache"), { recursive: true });

  for (const resourceName of KNOWN_RESOURCES) {
    const entry = Object.values(remoteMeta.components).find(e => e.archive === resourceName);
    if (!entry) {
      logger.warn(`[resources] ${resourceName} not in remote metadata`);
      continue;
    }

    if (!needsUpdate(resourceName, entry, localMeta)) {
      logger.info(`[resources] ${resourceName} is up to date`);
      continue;
    }

    sendProgress("downloading", 0, `Baixando ${resourceName}...`);
    logger.info(`[resources] Downloading ${resourceName} (v${entry.version})`);

    const downloadPath = getDownloadPath(resourceName);

    try {
      await downloadFile(getMirrorUrls(entry, resourceName), downloadPath);
    } catch (err) {
      logger.error(`[resources] Failed to download ${resourceName}: ${err}`);
      continue;
    }

    const hash = sha256File(downloadPath);
    if (hash !== entry.sha256) {
      logger.error(`[resources] ${resourceName} hash mismatch: got ${hash}, expected ${entry.sha256}`);
      try { fs.rmSync(downloadPath); } catch {}
      continue;
    }

    sendProgress("extracting", 50, `Extraindo ${resourceName}...`);

    try {
      if (resourceName === "releases.tar.gz") {
        await extractTarGz(downloadPath, path.join(resourcesDir, "data"));
      } else if (resourceName === "bootstrap.tar.gz") {
        await extractTarGz(downloadPath, path.join(resourcesDir, "bootstrap"));
      } else if (resourceName === "installer-api.tar.gz") {
        await extractTarGz(downloadPath, path.join(resourcesDir, "installer-api"));
      } else if (resourceName.endsWith(".db.gz")) {
        const baseName = resourceName.replace(".gz", "");
        const outputPath = path.join(resourcesDir, "database", baseName);
        await extractGz(downloadPath, outputPath);
      }
    } catch (err) {
      logger.error(`[resources] Failed to extract ${resourceName}: ${err}`);
      continue;
    }

    const localMeta2 = loadLocalMetadata() || { version: 0, components: {} };
    localMeta2.components[resourceName] = entry;
    fs.writeFileSync(getLocalMetadataPath(), JSON.stringify(localMeta2, null, 2));

    sendProgress("ready", 100, `${resourceName} pronto`);
  }

  sendProgress("ready", 100, "Todos os recursos prontos");
  return true;
}

export function getProtonDataPath(): string {
  const userDataPath = path.join(app.getPath("userData"), "resources", "database", "proton_data.db");
  if (fs.existsSync(userDataPath)) return userDataPath;
  return path.join(app.getAppPath(), "app", "_data", "proton_data.db");
}

export function getReleasesDir(): string {
  const userDataPath = path.join(app.getPath("userData"), "resources", "data", "releases");
  if (fs.existsSync(userDataPath)) return userDataPath;
  return path.join(app.getAppPath(), "app", "_data", "releases");
}

export function getSourcesDir(): string {
  const userDataPath = path.join(app.getPath("userData"), "resources", "data", "sources");
  if (fs.existsSync(userDataPath)) return userDataPath;
  return path.join(app.getAppPath(), "app", "_data", "sources");
}

export function getInstallerApiDir(): string {
  return path.join(app.getPath("userData"), "resources", "installer-api");
}

import { app } from "electron";
import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const CHROME_DIR = path.join(app.getAppPath(), "app", "_resources", "chrome");
const CHROME_BINARY = path.join(CHROME_DIR, "chrome-linux64", "chrome");
const API_URL = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";
const EXT_ID = "mjnbclmflcpookeapghfhapeffmpodij";

export interface SetupProgress {
  status: string;
  detail?: string;
  progress: number;
  done?: boolean;
  error?: string;
}

type ProgressCallback = (p: SetupProgress) => void;

function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("Falha ao parsear JSON")); }
      });
    }).on("error", reject);
  });
}

function download(url: string, dest: string, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    function handleResponse(res: http.IncomingMessage) {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const proto = res.headers.location.startsWith("https") ? https : http;
        proto.get(res.headers.location, handleResponse).on("error", reject);
        return;
      }

      const total = parseInt(res.headers["content-length"] || "0", 10);
      let downloaded = 0;

      res.on("data", (chunk: Buffer) => {
        downloaded += chunk.length;
        if (total && onProgress) {
          onProgress(Math.min(100, Math.round((downloaded / total) * 100)));
        }
      });

      res.pipe(file);
      res.on("end", () => { file.close(); resolve(); });
      res.on("error", (err) => { try { fs.unlinkSync(dest); } catch { } reject(err); });
    }

    const proto = url.startsWith("https") ? https : http;
    proto.get(url, handleResponse).on("error", (err) => { try { fs.unlinkSync(dest); } catch { } reject(err); });
  });
}

async function getChromeVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!fs.existsSync(CHROME_BINARY)) {
      resolve(null);
      return;
    }
    const proc = spawn(CHROME_BINARY, ["--version"]);
    let output = "";
    proc.stdout.on("data", (data) => output += data.toString());
    proc.on("close", () => {
      const match = output.match(/(\d+\.\d+\.\d+\.\d+)/);
      resolve(match ? match[1] : null);
    });
    proc.on("error", () => resolve(null));
  });
}

async function getLatestChromeVersion(): Promise<string> {
  const data = await fetchJSON(API_URL);
  return data.channels.Stable.version;
}

async function ensureChrome(onProgress: ProgressCallback): Promise<void> {
  const currentVersion = await getChromeVersion();
  const latestVersion = await getLatestChromeVersion();

  if (currentVersion && latestVersion && currentVersion === latestVersion) {
    onProgress({ status: "Chrome já atualizado", detail: `Versão ${currentVersion}`, progress: 40 });
    return;
  }

  if (currentVersion) {
    onProgress({ status: "Atualizando Chrome...", detail: `${currentVersion} → ${latestVersion}`, progress: 10 });
  } else {
    onProgress({ status: "Baixando Chrome portátil...", detail: `Versão ${latestVersion}`, progress: 10 });
  }

  const data = await fetchJSON(API_URL);
  const platform = process.platform === "win32" ? "win64" :
    process.platform === "darwin" ? "mac-x64" : "linux64";
  const dl = data.channels.Stable.downloads.chrome.find((d: any) => d.platform === platform);
  if (!dl) throw new Error(`Nenhum download para ${platform}`);

  const zipName = `chrome-${latestVersion}-${process.platform}.zip`;
  const zipPath = path.join(CHROME_DIR, zipName);

  fs.mkdirSync(CHROME_DIR, { recursive: true });

  onProgress({ status: "Baixando Chrome...", detail: `${latestVersion} (0%)`, progress: 15 });
  await download(dl.url, zipPath, (pct) => {
    const mapped = 15 + Math.round(pct * 0.45);
    onProgress({ status: "Baixando Chrome...", detail: `${latestVersion} (${pct}%)`, progress: mapped });
  });

  onProgress({ status: "Extraindo Chrome...", detail: "", progress: 60 });

  await new Promise<void>((resolve, reject) => {
    const unzip = spawn("unzip", ["-o", zipPath, "-d", CHROME_DIR], { stdio: "inherit" });
    unzip.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`unzip exit code ${code}`)));
    unzip.on("error", reject);
  });

  if (process.platform === "linux") {
    if (fs.existsSync(CHROME_BINARY)) fs.chmodSync(CHROME_BINARY, 0o755);
  }

  fs.unlinkSync(zipPath);
  onProgress({ status: "Chrome instalado", detail: `Versão ${latestVersion}`, progress: 70 });
}

async function ensureExtension(onProgress: ProgressCallback): Promise<string | null> {
  const extTargetDir = path.join(app.getAppPath(), "app", "_resources", "extensions", EXT_ID);

  if (fs.existsSync(extTargetDir)) {
    onProgress({ status: "Extensão já instalada", progress: 90 });
    return extTargetDir;
  }

  onProgress({ status: "Baixando extensão...", detail: "UltraSurf (0%)", progress: 75 });

  const extDir = path.join(app.getAppPath(), "app", "_resources", "extensions");
  fs.mkdirSync(extDir, { recursive: true });

  const CRX_PATH = path.join(extDir, `${EXT_ID}.crx`);
  const CRX_URL = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=131.0&acceptformat=crx3&x=id%3D${EXT_ID}%26installsource%3Dondemand%26uc`;

  await download(CRX_URL, CRX_PATH, (pct) => {
    const mapped = 75 + Math.round(pct * 0.1);
    onProgress({ status: "Baixando extensão...", detail: `UltraSurf (${pct}%)`, progress: mapped });
  });

  onProgress({ status: "Instalando extensão...", progress: 85 });

  const buf = fs.readFileSync(CRX_PATH);
  if (buf.toString("utf-8", 0, 4) !== "Cr24") throw new Error("Arquivo de extensão inválido");
  const version = buf.readUInt8(4);
  let zipBuf: Buffer;
  if (version === 3) {
    const headerSize = buf.readUInt8(5) | (buf.readUInt8(6) << 8) | (buf.readUInt8(7) << 16);
    zipBuf = buf.subarray(8 + headerSize);
  } else {
    const pubKeyLength = buf.readUInt32LE(8);
    const sigLength = buf.readUInt32LE(12);
    zipBuf = buf.subarray(16 + pubKeyLength + sigLength);
  }
  const zipPath = CRX_PATH + ".zip";
  fs.writeFileSync(zipPath, zipBuf);

  fs.mkdirSync(extTargetDir, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const unzip = spawn("unzip", ["-o", zipPath, "-d", extTargetDir], { stdio: "inherit" });
    unzip.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`unzip exit code ${code}`)));
    unzip.on("error", reject);
  });

  fs.unlinkSync(zipPath);
  fs.unlinkSync(CRX_PATH);

  const configPath = path.join(extTargetDir, "src", "core", "config.js");
  if (fs.existsSync(configPath)) {
    let configContent = fs.readFileSync(configPath, "utf-8");
    configContent = configContent
      .replace("enabled: false", "enabled: true")
      .replace("safeBrowsingEnabled: false", "safeBrowsingEnabled: true")
      .replace("safeBrowsingDisclosureShown: false", "safeBrowsingDisclosureShown: true");
    fs.writeFileSync(configPath, configContent);
  }

  const storagePath = path.join(extTargetDir, "src", "core", "storage.js");
  if (fs.existsSync(storagePath)) {
    let storageContent = fs.readFileSync(storagePath, "utf-8");
    storageContent = storageContent.replace(
      "patch.enabled = false;\n    patch.safeBrowsingEnabled = false;",
      "patch.safeBrowsingEnabled = true;"
    );
    fs.writeFileSync(storagePath, storageContent);
  }

  const bgPath = path.join(extTargetDir, "background.js");
  if (fs.existsSync(bgPath)) {
    let bgContent = fs.readFileSync(bgPath, "utf-8");
    bgContent = bgContent.replace(
      'enabled: false,\n      state: "disconnect",\n      safeBrowsingEnabled: false,\n      safeBrowsingDisclosureShown: false,',
      'enabled: true,\n      state: "disconnect",\n      safeBrowsingEnabled: true,\n      safeBrowsingDisclosureShown: true,'
    );
    fs.writeFileSync(bgPath, bgContent);
  }

  onProgress({ status: "Extensão instalada!", detail: "UltraSurf ativado", progress: 95 });
  return extTargetDir;
}

const CONFIG_PATH = path.join(app.getAppPath(), "config", "config.json");

export function loadConfig(): { chromePath: string; extensionPath: string | null } | null {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      const chromeOk = cfg.chromePath && fs.existsSync(cfg.chromePath);
      const extOk = !cfg.extensionPath || fs.existsSync(cfg.extensionPath);
      if (chromeOk && extOk) {
        return { chromePath: cfg.chromePath, extensionPath: cfg.extensionPath || null };
      }
    }
  } catch { /* ignore */ }
  return null;
}

export function saveConfig(chromePath: string, extensionPath: string | null): void {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ chromePath, extensionPath }, null, 2));
  } catch { /* ignore */ }
}

export async function runSetup(onProgress: ProgressCallback): Promise<{ chromePath: string; extensionPath: string | null }> {
  onProgress({ status: "Verificando Chrome...", progress: 5 });

  await ensureChrome(onProgress);
  const extPath = await ensureExtension(onProgress);

  const result = { chromePath: CHROME_BINARY, extensionPath: extPath };
  saveConfig(result.chromePath, result.extensionPath);

  onProgress({ status: "Pronto!", detail: "Setup concluído", progress: 100, done: true });

  return result;
}

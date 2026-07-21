import { RunnerDefinition, RunnerStatus } from "./types";
import { getRunnerById } from "./registry";
import path from "path";
import fs from "fs/promises";
import { app } from "electron";
import { spawn, ChildProcess } from "child_process";

const runningProcesses = new Map<string, ChildProcess>();

const RETROARCH_URL = "https://github.com/hizzlekizzle/RetroArch-AppImage/releases/download/Linux_LTS_Nightlies/RetroArch-Linux-x86_64-Nightly.AppImage";
const RETROARCH_DIR_NAME = "__retroarch__";
const RETROARCH_EXE = "retroarch.AppImage";

function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/\*/g, ".*"));
}

function getRunnersDir(): string {
  return path.join(app.getPath("userData"), "runners");
}

export function getRunnerDir(runnerId: string): string {
  return path.join(getRunnersDir(), runnerId);
}

export async function isInstalled(runnerId: string): Promise<boolean> {
  try {
    await fs.access(getRunnerDir(runnerId));
    return true;
  } catch {
    return false;
  }
}

export async function getInstalledVersions(): Promise<Map<string, string>> {
  const dir = getRunnersDir();
  const versions = new Map<string, string>();
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const versionPath = path.join(dir, entry.name, ".version");
        try {
          const v = await fs.readFile(versionPath, "utf-8");
          versions.set(entry.name, v.trim());
        } catch {
          versions.set(entry.name, "unknown");
        }
      }
    }
  } catch {}
  return versions;
}

export async function getRunnerStatus(
  definition: RunnerDefinition
): Promise<RunnerStatus> {
  const installed = await isInstalled(definition.id);
  let installedVersion: string | undefined;
  let installPath: string | undefined;

  if (installed) {
    installPath = getRunnerDir(definition.id);
    const versionPath = path.join(installPath, ".version");
    try {
      installedVersion = (await fs.readFile(versionPath, "utf-8")).trim();
    } catch {
      installedVersion = "unknown";
    }
  }

  return {
    id: definition.id,
    isInstalled: installed,
    installedVersion,
    updateAvailable: false,
    installPath,
  };
}

async function ensureRetroArch(): Promise<string> {
  const dir = path.join(getRunnersDir(), RETROARCH_DIR_NAME);
  const exePath = path.join(dir, RETROARCH_EXE);
  try {
    await fs.access(exePath);
    return exePath;
  } catch {
    await fs.mkdir(dir, { recursive: true });
    const downloaded = await downloadWithProgress(RETROARCH_URL, dir);
    const appImagePath = (await fs.readdir(dir)).find((e) => e.endsWith(".AppImage"));
    if (appImagePath && appImagePath !== RETROARCH_EXE) {
      await fs.rename(path.join(dir, appImagePath), exePath);
    }
    await fs.chmod(exePath, 0o755);
    return exePath;
  }
}

async function createLibretroLauncher(
  destDir: string,
  coreName: string,
  retroarchPath: string
): Promise<string> {
  const coreDir = path.join(destDir, "cores");
  const launcherPath = path.join(destDir, "launcher.sh");
  const launcherContent = `#!/bin/bash
exec "${retroarchPath}" --core "${coreDir}/${coreName}" "$@"
`;
  await fs.writeFile(launcherPath, launcherContent, "utf-8");
  await fs.chmod(launcherPath, 0o755);
  return launcherPath;
}

export async function installRunner(
  definition: RunnerDefinition,
  onProgress?: (percent: number) => void,
  onStatus?: (status: string) => void
): Promise<void> {
  const destDir = getRunnerDir(definition.id);
  onStatus?.("Preparando...");

  let downloadedFile: string | undefined;

  if (definition.downloadUrl) {
    onStatus?.("Baixando...");
    downloadedFile = await downloadWithProgress(definition.downloadUrl, destDir, onProgress);
    onStatus?.("Extraindo...");
  } else if (definition.repo) {
    onStatus?.("Buscando última versão no GitHub...");
    const release = await fetchLatestRelease(definition.repo);
    const asset = release.assets.find((a: any) =>
      globToRegex(definition.assetPattern || "*.tar.gz").test(a.name)
    );
    if (!asset) throw new Error(`Nenhum asset encontrado para ${definition.id}`);

    onStatus?.(`Baixando ${asset.name}...`);
    downloadedFile = await downloadWithProgress(asset.browser_download_url, destDir, onProgress);
    onStatus?.("Extraindo...");
    await fs.writeFile(
      path.join(destDir, ".version"),
      release.tag_name,
      "utf-8"
    );
  } else if (definition.isPaid) {
    throw new Error(
      `${definition.id} é um software pago. Adquira em ${definition.paidUrl || "o site oficial"} e instale manualmente.`
    );
  } else if (definition.isAbandoned) {
    throw new Error(
      `${definition.id} está abandonado e não possui binários disponíveis para download automático. ${definition.notes || "Instale manualmente."}`
    );
  } else {
    throw new Error(`${definition.id} não tem downloadUrl nem repo configurado`);
  }

  if (!downloadedFile) {
    onStatus?.("Falha ao baixar o arquivo");
    return;
  }

  const ext = path.extname(downloadedFile);
  const name = path.basename(downloadedFile);

  if (name.endsWith(".tar.gz") || name.endsWith(".tgz")) {
    await extractTarGz(downloadedFile, destDir);
    await fs.rm(downloadedFile, { force: true });
  } else if (name.endsWith(".tar.xz") || name.endsWith(".txz")) {
    await extractTarXz(downloadedFile, destDir);
    await fs.rm(downloadedFile, { force: true });
  } else if (name.endsWith(".zip")) {
    await extractZip(downloadedFile, destDir);
    await fs.rm(downloadedFile, { force: true });
  } else if (name.endsWith(".deb")) {
    await extractDeb(downloadedFile, destDir);
    await fs.rm(downloadedFile, { force: true });
  } else if (
    name.endsWith(".AppImage") ||
    name.endsWith(".desktop") ||
    name.includes("zsnes")
  ) {
    // Already saved to destDir by downloadWithProgress
  } else {
    // Assume it's an executable, already in destDir
  }

  // If extraction created a subfolder, flatten it
  await flattenExtractedDir(destDir).catch(() => {});

  // If libretro core, set up RetroArch wrapper
  if (definition.runnerType === "libretro" && definition.libretroCoreId) {
    onStatus?.("Configurando núcleo libretro...");
    const coreName = `${definition.libretroCoreId}_libretro.so`;
    const coreDir = path.join(destDir, "cores");
    await fs.mkdir(coreDir, { recursive: true });
    const entries = await fs.readdir(destDir);
    const soFile = entries.find((e) => e.endsWith("_libretro.so"));
    if (soFile) {
      await fs.rename(path.join(destDir, soFile), path.join(coreDir, coreName));
    }
    const retroarchPath = await ensureRetroArch();
    const launcherPath = await createLibretroLauncher(destDir, coreName, retroarchPath);
    definition.executablePath = "launcher.sh";
    onStatus?.("RetroArch pronto");
  }

  // Make executables findable
  const exeName = await resolveExecutable(destDir, definition).catch(() => null);
  if (exeName) {
    // Link or rename so that definition.executablePath works
    const expected = path.join(destDir, definition.executablePath || exeName);
    if (expected !== exeName && exeName) {
      try {
        await fs.unlink(expected).catch(() => {});
        await fs.symlink(path.basename(exeName), expected).catch(async () => {
          await fs.copyFile(exeName, expected).catch(() => {});
        });
      } catch {}
    }
    try {
      await fs.chmod(expected, 0o755);
    } catch {}
  }

  onStatus?.("Concluído!");
  onProgress?.(100);
}

async function resolveExecutable(
  destDir: string,
  definition: RunnerDefinition
): Promise<string | null> {
  const entries = await fs.readdir(destDir);
  // Prefer exact match with executablePath
  if (definition.executablePath) {
    const exact = path.join(destDir, definition.executablePath);
    try {
      await fs.access(exact);
      return exact;
    } catch {}
  }
  // Look for AppImage
  const appImage = entries.find((e) => e.endsWith(".AppImage"));
  if (appImage) return path.join(destDir, appImage);
  // Look for executable file named after the id
  const idExe = entries.find(
    (e) => e === definition.id || e.startsWith(definition.id + ".")
  );
  if (idExe) return path.join(destDir, idExe);
  return null;
}

async function extractTarGz(filePath: string, destDir: string): Promise<void> {
  const tar = await import("tar");
  await tar.extract({
    file: filePath,
    cwd: destDir,
    strip: 1,
  });
}

async function extractTarXz(filePath: string, destDir: string): Promise<void> {
  const tar = await import("tar");
  const { createReadStream } = await import("fs");
  const { spawn } = await import("child_process");
  const xz = spawn("xz", ["-d", "-c", filePath]);
  const writable = await tar.extract({
    cwd: destDir,
    strip: 1,
  });
  return new Promise((resolve, reject) => {
    xz.stdout.pipe(writable);
    writable.on("finish", resolve);
    writable.on("error", reject);
    xz.on("error", reject);
  });
}

async function extractZip(filePath: string, destDir: string): Promise<void> {
  const { execSync } = require("child_process");
  execSync(`unzip -o "${filePath}" -d "${destDir}"`, { stdio: "ignore" });
}

async function extractDeb(filePath: string, destDir: string): Promise<void> {
  const { execSync } = require("child_process");
  const tmpDir = path.join(destDir, ".deb_tmp");
  await fs.mkdir(tmpDir, { recursive: true });
  execSync(`ar x "${filePath}"`, { cwd: tmpDir, stdio: "ignore" });
  const dataArchives = await fs.readdir(tmpDir);
  const dataTar = dataArchives.find((e) => e.startsWith("data.tar"));
  if (dataTar) {
    const tar = await import("tar");
    const dataPath = path.join(tmpDir, dataTar);
    if (dataTar.endsWith(".xz")) {
      const { createReadStream } = await import("fs");
      const xz = spawn("xz", ["-d", "-c", dataPath]);
      return new Promise((resolve, reject) => {
        const extract = tar.extract({
          cwd: destDir,
          strip: 2,
        });
        xz.stdout.pipe(extract);
        extract.on("finish", () => {
          fs.rm(tmpDir, { recursive: true, force: true }).then(resolve).catch(resolve);
        });
        extract.on("error", reject);
        xz.on("error", reject);
      });
    } else if (dataTar.endsWith(".gz")) {
      await tar.extract({ file: dataPath, cwd: destDir, strip: 2 });
    }
  }
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
}

async function flattenExtractedDir(destDir: string): Promise<void> {
  const entries = await fs.readdir(destDir, { withFileTypes: true });
  const subdirs = entries.filter((e) => e.isDirectory());
  const files = entries.filter((e) => e.isFile()).filter((e) => e.name !== ".version");

  // If the only contents are a single subdirectory, move contents up
  if (subdirs.length === 1 && files.length === 0) {
    const subPath = path.join(destDir, subdirs[0].name);
    const subEntries = await fs.readdir(subPath);
    for (const entry of subEntries) {
      const src = path.join(subPath, entry);
      const dst = path.join(destDir, entry);
      await fs.rename(src, dst).catch(() => {});
    }
    await fs.rm(subPath, { recursive: true, force: true });
  }
}

export async function fetchLatestRelease(repo: {
  owner: string;
  repo: string;
}) {
  // Segue redirect de /releases/latest para /releases/tag/{tag}
  const latestUrl = `https://github.com/${repo.owner}/${repo.repo}/releases/latest`;
  const headRes = await fetch(latestUrl, { method: "HEAD", redirect: "manual" });
  const location = headRes.headers.get("location");
  if (!location || !location.includes("/releases/tag/")) {
    throw new Error(`Repositório não encontrado ou sem releases: ${repo.owner}/${repo.repo}`);
  }
  const tagName = location.split("/releases/tag/").pop()!;

  // Página expanded_assets lista todos os assets SEM rate limit
  const assetsUrl = `https://github.com/${repo.owner}/${repo.repo}/releases/expanded_assets/${encodeURIComponent(tagName)}`;
  const html = await (await fetch(assetsUrl)).text();

  // Extrai links de download: /{owner}/{repo}/releases/download/{tag}/{assetName}
  const ownerRepo = `/${repo.owner}/${repo.repo}/releases/download/`;
  const pattern = new RegExp(`href="${ownerRepo}[^"]*"`, "g");
  const matches = html.match(pattern) || [];

  const seen = new Set<string>();
  const assets = matches
    .map((m: string) => {
      const fullPath = m.replace(`href="`, "").replace(`"`, "");
      const name = fullPath.split("/").pop()!;
      return { name, browser_download_url: `https://github.com${fullPath}` };
    })
    .filter((a: { name: string }) => {
      if (seen.has(a.name)) return false;
      seen.add(a.name);
      return true;
    });

  if (assets.length === 0) {
    throw new Error(`Nenhum asset encontrado para ${repo.owner}/${repo.repo} (tag: ${tagName})`);
  }

  return {
    tag_name: tagName,
    assets,
  };
}

async function downloadWithProgress(
  url: string,
  destDir: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  await fs.mkdir(destDir, { recursive: true });
  const response = await fetch(url);
  const contentLength = response.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength) : 0;
  const reader = response.body!.getReader();

  const filename = path.basename(new URL(url).pathname);
  const destPath = path.join(destDir, filename);
  const tempFile = path.join(destDir, ".download.tmp");
  const writeStream = require("fs").createWriteStream(tempFile);
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    writeStream.write(value);
    received += value.length;
    if (total && onProgress) onProgress(Math.round((received / total) * 100));
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
    writeStream.close();
  });

  await fs.rename(tempFile, destPath);
  return destPath;
}

export async function uninstallRunner(runnerId: string): Promise<void> {
  const dir = getRunnerDir(runnerId);
  await fs.rm(dir, { recursive: true, force: true });
}

export async function launchGame(
  runnerId: string,
  romPath: string,
  onExit?: (id: string) => void
): Promise<void> {
  const definition = getRunnerById(runnerId);
  if (!definition) throw new Error(`Runner não encontrado: ${runnerId}`);

  const runnerDir = getRunnerDir(runnerId);
  const exe = path.join(runnerDir, definition.executablePath);
  const args = romPath ? definition.launchArgs(romPath) : [];

  const proc = spawn(exe, args, {
    cwd: runnerDir,
    stdio: "ignore",
    detached: true,
  });
  proc.unref();
  runningProcesses.set(runnerId, proc);
  const cleanup = () => {
    runningProcesses.delete(runnerId);
    onExit?.(runnerId);
  };
  proc.on("exit", cleanup);
  proc.on("error", cleanup);
}

export async function closeRunner(runnerId: string): Promise<void> {
  const proc = runningProcesses.get(runnerId);
  if (proc) {
    runningProcesses.delete(runnerId);
    const killed = proc.kill("SIGTERM");
    if (!killed) {
      proc.kill("SIGKILL");
    }
    // Give it a moment
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

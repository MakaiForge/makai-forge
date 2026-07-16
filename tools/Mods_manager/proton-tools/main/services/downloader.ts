import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import { arch } from "node:process";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { ProtonTool, ProtonRelease } from "./types";
import { logger } from "@main/services/logger";

const ARCH_PATTERN = arch === "arm64" ? "arm64" : "x86_64";

function archMatch(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.includes("arm64")) return ARCH_PATTERN === "arm64";
  if (lower.includes("aarch64")) return ARCH_PATTERN === "arm64";
  if (lower.includes("x86_64")) return ARCH_PATTERN === "x86_64";
  if (lower.includes("amd64")) return ARCH_PATTERN === "x86_64";
  if (lower.includes("i686")) return ARCH_PATTERN === "x86_64";
  if (lower.includes("x64")) return ARCH_PATTERN === "x86_64";
  return true;
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export async function downloadFile(
  tool: ProtonTool,
  release: ProtonRelease,
  destinationDir: string,
  onProgress?: (percent: number, speed: string) => void
): Promise<DownloadResult> {
  const url = await getDownloadUrl(tool, release);
  if (!url) {
    return { success: false, error: "No download URL available" };
  }

  const urlLower = url.toLowerCase();
  let fileName: string;
  let tempPath: string;

  if (urlLower.endsWith(".tar.xz") || urlLower.endsWith(".xz")) {
    fileName = `${formatFileName(tool, release)}.tar.xz`;
  } else if (urlLower.endsWith(".zip")) {
    fileName = `${formatFileName(tool, release)}.zip`;
  } else if (urlLower.endsWith(".tar.gz") || urlLower.endsWith(".tgz")) {
    fileName = `${formatFileName(tool, release)}.tar.gz`;
  } else {
    fileName = `${formatFileName(tool, release)}.tar.gz`;
  }

  tempPath = path.join(destinationDir, fileName);

  if (!fs.existsSync(destinationDir)) {
    fs.mkdirSync(destinationDir, { recursive: true });
  }

  try {
    const response = await axios.get(url, {
      responseType: "stream",
      timeout: 300000,
      maxRedirects: 5,
    });

    const totalSize = parseInt(String(response.headers["content-length"] || "0"), 10);
    let downloaded = 0;
    const startTime = Date.now();

    response.data.on("data", (chunk: Buffer) => {
      downloaded += chunk.length;
      if (totalSize > 0 && onProgress) {
        const percent = Math.round((downloaded / totalSize) * 100);
        const elapsed = (Date.now() - startTime) / 1000;
        const speed =
          elapsed > 0 ? (downloaded / elapsed / 1024 / 1024).toFixed(1) : "0";
        onProgress(percent, speed);
      }
    });

    const writer = createWriteStream(tempPath);
    await pipeline(response.data, writer);

    return { success: true, filePath: tempPath };
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    return { success: false, error: String(error) };
  }
}

async function getDownloadUrl(
  tool: ProtonTool,
  release: ProtonRelease
): Promise<string | null> {
  if (tool.type === "github-action" && release.artifacts_url) {
    return await getGithubActionArtifactUrl(release.artifacts_url);
  }

  if (tool.preferTarball) {
    if (release.tarball_url) return release.tarball_url;
    const constructed = constructGithubTarballUrl(tool, release.tag_name);
    if (constructed) return constructed;
  }

  if (!release.assets || release.assets.length === 0) {
    if (release.tarball_url) return release.tarball_url;
    if (release.zipball_url) return release.zipball_url;
    return constructGithubTarballUrl(tool, release.tag_name);
  }

  // Filter: only archives that match system arch OR have no arch keyword (generic)
  const candidates = release.assets.filter((a) => {
    const name = a.name.toLowerCase();
    if (!name.endsWith(".tar.gz") && !name.endsWith(".zip") && !name.endsWith(".tar.xz")) return false;
    if (archMatch(a.name)) return true;
    return false;
  });

  // Prefer explicit arch match, then generic (no arch keyword)
  const explicit = candidates.find((a) => a.name.toLowerCase().includes(ARCH_PATTERN));
  if (explicit) return explicit.browser_download_url;

  const generic = candidates.find((a) => !hasArchKeyword(a.name));
  if (generic) return generic.browser_download_url;

  if (candidates.length > 0) return candidates[0].browser_download_url;

  if (release.tarball_url) return release.tarball_url;
  if (release.zipball_url) return release.zipball_url;

  return constructGithubTarballUrl(tool, release.tag_name);
}

/** True if the filename mentions any known architecture. */
function hasArchKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("x86_64") || lower.includes("amd64") ||
         lower.includes("i686") || lower.includes("x64") ||
         lower.includes("aarch64") || lower.includes("arm64");
}

function constructGithubTarballUrl(tool: ProtonTool, tagName: string): string | null {
  if (tool.type !== "github") return null;
  const match = tool.endpoint.match(/github\.com\/repos\/([^/]+\/[^/]+)/);
  if (!match) return null;
  return `https://github.com/${match[1]}/archive/refs/tags/${tagName}.tar.gz`;
}

async function getGithubActionArtifactUrl(artifactsUrl: string): Promise<string | null> {
  try {
    const response = await fetch(artifactsUrl, {
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    const artifacts = data.artifacts;
    if (!Array.isArray(artifacts) || artifacts.length === 0) return null;

    const fileNamePatterns = ["proton", "Proton", "wine-tkg", "pkg"];
    for (const pattern of fileNamePatterns) {
      const match = artifacts.find((a: any) =>
        a.name.toLowerCase().includes(pattern.toLowerCase())
      );
      if (match) return match.archive_download_url;
    }

    return artifacts[0].archive_download_url || null;
  } catch (error) {
    logger.error(`Failed to fetch artifacts from ${artifactsUrl}:`, error);
    return null;
  }
}

function formatFileName(tool: ProtonTool, release: ProtonRelease): string {
  const ver = release.tag_name.replace(/^v/, "");
  return tool.directoryNameFormat.replace("$version", ver);
}

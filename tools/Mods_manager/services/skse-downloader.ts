import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { MakaiRPC } from "@mods-manager/services/makai-rpc";
import { logger } from "@main/services";
import { isGogGame } from "@mods/services/gog-detection";

interface SkseRelease {
  version: string;
  url: string;
  gogUrl?: string;
  loader: string;
}

const SKSE_RELEASES: Record<string, SkseRelease> = {
  skyrim: { version: "1_07_03", url: "https://skse.silverlock.org/beta/skse_1_07_03.7z", loader: "skse_loader.exe" },
  skyrim_se: {
    version: "2_02_06",
    url: "https://skse.silverlock.org/beta/skse64_2_02_06.7z",
    gogUrl: "https://skse.silverlock.org/beta/skse64_2_02_06_gog.7z",
    loader: "skse64_loader.exe",
  },
  skyrim_vr: { version: "2_00_12", url: "https://skse.silverlock.org/beta/sksevr_2_00_12.7z", loader: "sksevr_loader.exe" },
  enderal: { version: "1_07_03", url: "https://skse.silverlock.org/beta/skse_1_07_03.7z", loader: "skse_loader.exe" },
  enderal_se: {
    version: "2_02_06",
    url: "https://skse.silverlock.org/beta/skse64_2_02_06.7z",
    gogUrl: "https://skse.silverlock.org/beta/skse64_2_02_06_gog.7z",
    loader: "skse64_loader.exe",
  },
  fallout3: { version: "4_2_2", url: "https://github.com/llde/FOSE/releases/download/4.2.2/fose_4_2_2.7z", loader: "fose_loader.exe" },
  falloutnv: { version: "6_4_8", url: "https://github.com/xNVSE/NVSE/releases/download/6.4.8/nvse_6_4_8.7z", loader: "nvse_loader.exe" },
  fallout4: { version: "0_06_23", url: "https://f4se.silverlock.org/beta/f4se_0_06_23.7z", loader: "f4se_loader.exe" },
  fallout4_vr: { version: "0_2_0", url: "https://github.com/llde/F4SEVR/releases/download/0.2.0/f4sevr_0_2_0.7z", loader: "f4sevr_loader.exe" },
  oblivion: { version: "21_0", url: "https://github.com/llde/OBSE/releases/download/21.0/obse_21_0.7z", loader: "obse_loader.exe" },
  morrowind: { version: "2_1", url: "https://github.com/MWSE/MWSE/releases/download/2.1/MWSE-2.1.7z", loader: "mwse_loader.exe" },
  starfield: { version: "0_2_6", url: "https://sfse.silverlock.org/beta/sfse_0_2_6.7z", loader: "sfse_loader.exe" },
};

function resolveSkseUrl(gameId: string, gamePath: string): string | null {
  const release = SKSE_RELEASES[gameId.toLowerCase()];
  if (!release) return null;
  if (release.gogUrl && isGogGame(gamePath)) return release.gogUrl;
  return release.url;
}

export function isSkseAvailable(gameId: string): boolean {
  return gameId.toLowerCase() in SKSE_RELEASES;
}

export function verifySkse(gamePath: string, gameId: string): boolean {
  const release = SKSE_RELEASES[gameId.toLowerCase()];
  if (!release) return false;
  return fs.existsSync(path.join(gamePath, release.loader));
}

export function getSkseSource(gamePath: string): "steam" | "gog" {
  return isGogGame(gamePath) ? "gog" : "steam";
}

export async function downloadSkse(gameId: string, gamePath: string): Promise<boolean> {
  const release = SKSE_RELEASES[gameId.toLowerCase()];
  if (!release) return false;
  const url = resolveSkseUrl(gameId, gamePath);
  if (!url) return false;
  const loaderPath = path.join(gamePath, release.loader);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skse-"));
  const archivePath = path.join(tmpDir, "skse.7z");
  try {
    await MakaiRPC.call("download_file", { url, dest: archivePath });

    await MakaiRPC.call("extract_archive", { archive: archivePath, dest: tmpDir });

    const entries = fs.readdirSync(tmpDir);
    const extractedFolder = entries.find(e => {
      const lower = e.toLowerCase();
      return (lower.startsWith("skse") || lower.startsWith("fose") || lower.startsWith("nvse") ||
        lower.startsWith("f4se") || lower.startsWith("obse") || lower.startsWith("mwse") ||
        lower.startsWith("sfse")) && fs.statSync(path.join(tmpDir, e)).isDirectory();
    });
    const srcDir = extractedFolder ? path.join(tmpDir, extractedFolder) : tmpDir;
    const files = fs.readdirSync(srcDir);
    for (const file of files) {
      const src = path.join(srcDir, file);
      const dst = path.join(gamePath, file);
      fs.cpSync(src, dst, { recursive: true, force: true });
      try { fs.chmodSync(dst, 0o755); } catch { /* skip */ }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return fs.existsSync(loaderPath);
  } catch (err) {
    logger.error("SKSE download failed", err);
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    return false;
  }
}

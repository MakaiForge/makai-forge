import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getGameModule } from "@games/registry";
import { ModStorageService, logger } from "@main/services";
import { ProtonRecommendationService } from "@provision/proton_recommended/services/proton-recommendation";
import { getInstalledTools, getReleases, downloadTool } from "@proton/main/services";
import { findToolIdByForkName, getToolById } from "@proton/main/services/tools";
import type { ProtonRelease } from "@proton/main/services/types";
import type { SendProgress } from "../types";

export interface ProtonInfo {
  protonPath: string
  useCustomPrefix?: boolean
}

function readPrefixVersion(prefixPath: string): string | null {
  const versionFile = path.join(prefixPath, "..", "version");
  if (!fs.existsSync(versionFile)) return null;
  try {
    return fs.readFileSync(versionFile, "utf-8").trim();
  } catch {
    return null;
  }
}

function isGeProtonVersion(version: string): boolean {
  return version.includes("GE-Proton") || version.includes("GE-");
}

function isExistingSteamPrefix(prefixPath: string): boolean {
  const compatPattern = path.sep + "compatdata" + path.sep;
  if (!prefixPath.includes(compatPattern)) return false;
  return fs.existsSync(path.join(prefixPath, "drive_c"));
}

function findSteamProton(): string | null {
  const searchPaths = [
    path.join(os.homedir(), ".local", "share", "Steam"),
    path.join(os.homedir(), ".steam", "steam"),
    "/usr/share/steam",
  ];
  const seen = new Set<string>();
  for (const sp of searchPaths) {
    if (seen.has(sp)) continue;
    seen.add(sp);
    const commonDir = path.join(sp, "steamapps", "common");
    if (!fs.existsSync(commonDir)) continue;
    try {
      const entries = fs.readdirSync(commonDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith("Proton") || entry.name.startsWith("proton")) {
          const protonDir = path.join(commonDir, entry.name);
          if (fs.existsSync(path.join(protonDir, "proton"))) return protonDir;
        }
      }
    } catch { continue; }
  }
  return null;
}

export async function ensureProton(
  gameId: string,
  send: SendProgress,
  prefixPath?: string,
): Promise<ProtonInfo> {
  // Check if user already has a Proton configured and installed
  const storedProton = ModStorageService.get<string>("proton_binary");
  if (storedProton && fs.existsSync(path.join(storedProton, "proton"))) {
    logger.log(`[ProtonDebug] using stored proton_binary: ${storedProton}`);
    send("proton", `✅ Proton configurado: ${path.basename(storedProton)}`, "done");
    return { protonPath: storedProton };
  }

  send("proton", "🔍 Consultando Proton recomendado...", "working");

  const mod = getGameModule(gameId);
  const searchId = mod?.steamAppId || gameId;
  const recommendation = await ProtonRecommendationService.recommend(searchId);
  const fork = recommendation.primary;

  if (!fork) {
    send("proton", "❌ Nenhum Proton recomendado disponível", "error");
    throw new Error("Nenhum Proton recomendado");
  }

  const forkName = fork.fork || fork.name;
  const forkVersion = fork.version || "latest";
  const protonLabel = `${forkName} ${forkVersion}`;

  // ── Check for Proton version mismatch ──
  let useCustomPrefix = false;
  if (prefixPath && forkName.toLowerCase().includes("ge")) {
    const prefixVer = readPrefixVersion(prefixPath);
    const mismatch = prefixVer ? !isGeProtonVersion(prefixVer) : isExistingSteamPrefix(prefixPath);
    logger.log(`[ProtonDebug] prefixVer=${prefixVer} mismatch=${mismatch} prefixPath=${prefixPath}`);
    if (mismatch) {
      const origin = prefixVer || "Steam (sem arquivo de versão)";
      send("proton", `⚠️ Prefixo existente criado por ${origin}, mas recomendação é ${forkName}. Buscando Proton Steam compatível...`, "working");
      const steamProton = findSteamProton();
      logger.log(`[ProtonDebug] findSteamProton=${steamProton}`);
      if (steamProton) {
        send("proton", `✅ Usando Proton Steam: ${steamProton}`, "done");
        ModStorageService.put("proton_binary", steamProton);
        return { protonPath: steamProton };
      }
      send("proton", `⚠️ Proton Steam não encontrado. Usando prefixo SEPARADO para não corromper o Steam.`, "working");
      useCustomPrefix = true;
    }
  } else {
    logger.log(`[ProtonDebug] pular check: prefixPath=${!!prefixPath} forkName=${forkName} incluiGE=${forkName.includes("GE")}`);
  }

  const installed = await getInstalledTools();
  const match = installed.find(i => {
    const toolId = i.tool.id.toLowerCase();
    const dirLower = path.basename(i.path).toLowerCase();
    const forkLower = forkName.toLowerCase();
    // Match by tool ID (e.g. "proton-ge" matches fork "ge-proton")
    if (toolId === "proton-ge" && forkLower.includes("ge-proton")) return true;
    if (toolId.includes(forkLower) || forkLower.includes(toolId)) return true;
    // Match by directory name (e.g. "GE-Proton11-1" includes "ge-proton")
    if (dirLower.includes(forkLower)) return true;
    // Match by version string
    const v = i.version.toLowerCase();
    if (v.includes(forkLower) || forkLower.includes(v)) return true;
    return false;
  });

  // Also try to find a version-specific match (e.g. GE-Proton11-1)
  const versionMatch = installed.find(i => {
    const dirLower = path.basename(i.path).toLowerCase();
    const v = i.version.toLowerCase();
    const fv = forkVersion.toLowerCase().replace(/^v/, "");
    if (fv === "latest") return false;
    return dirLower.includes(fv) || v.includes(fv);
  });

  const bestMatch = versionMatch || match;

  if (bestMatch) {
    send("proton", `✅ ${bestMatch.version || path.basename(bestMatch.path)} já instalado: ${bestMatch.path}`, "done");
    ModStorageService.put("proton_binary", bestMatch.path);
    logger.log(`[ProtonDebug] usando Proton instalado: ${bestMatch.path}, useCustomPrefix=${useCustomPrefix}`);
    return { protonPath: bestMatch.path, useCustomPrefix };
  }

  send("proton", `⬇️ Baixando ${protonLabel}...`, "working");

  try {
    const toolId = findToolIdByForkName({ fork: forkName, name: fork.name });
    const tool = toolId ? getToolById(toolId) : null;
    if (!tool) throw new Error(`Tool não encontrado para ${forkName}`);

    let releases = await getReleases(toolId!);
    if (releases.length === 0) {
      releases = await fetchGitHubReleases(tool.endpoint);
    }
    if (releases.length === 0) {
      throw new Error(`Nenhum release encontrado para ${forkName}`);
    }

    const release = pickRelease(releases, forkVersion, forkName);
    if (!release) throw new Error(`Release ${forkVersion} não encontrado para ${forkName}`);

    send("proton", `⬇️ Baixando ${release.tag_name}...`, "working");

    const result = await downloadTool({ toolId: toolId!, release });
    if (!result) throw new Error(`Falha no download de ${release.tag_name}`);

    send("proton", `✅ ${release.tag_name} instalado em ${result}`, "done");
    ModStorageService.put("proton_binary", result);
    return { protonPath: result, useCustomPrefix };
  } catch (err) {
    const msg = String(err).slice(0, 150);
    logger.error(`[Proton] ${msg}`);
    send("proton", `❌ ${msg}`, "error");
    throw new Error(`Falha ao obter Proton: ${msg}`);
  }
}

function normalizeProtonVersion(s: string): string {
  const matches = s.match(/\d+(?:\.\d+)*/g);
  return matches ? matches.join(".") : s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pickRelease(
  releases: ProtonRelease[],
  version: string,
  _forkName: string,
): ProtonRelease | null {
  if (version === "latest") return releases[0] || null;
  const v = version.toLowerCase().replace(/^v/, "");
  const vNums = normalizeProtonVersion(version);
  return releases.find(r => {
    const t = r.tag_name.toLowerCase().replace(/^v/, "");
    const tNums = normalizeProtonVersion(r.tag_name);
    if (t.includes(v) || v.includes(t)) return true;
    if (tNums === vNums) return true;
    if (tNums.includes(vNums) || vNums.includes(tNums)) return true;
    return false;
  }) || null;
}

async function fetchGitHubReleases(endpoint: string): Promise<ProtonRelease[]> {
  try {
    const res = await fetch(endpoint);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((r: any) => ({
      tag_name: r.tag_name,
      assets: (r.assets || []).map((a: any) => ({
        name: a.name,
        browser_download_url: a.browser_download_url,
      })),
      html_url: r.html_url || "",
      published_at: r.published_at || "",
    }));
  } catch {
    return [];
  }
}

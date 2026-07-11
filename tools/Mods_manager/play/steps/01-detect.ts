import { ModStorageService } from "@main/services";
import { getGameInfo, getGameModule } from "@games/registry";
import { findAllSteamLibraries } from "@prefix/core/steam-paths";
import { findGogGamePath, isGogGame } from "@mods/services/gog-detection";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import type { SendProgress, PlayResult } from "../types";

export interface DetectResult {
  gameId: string
  gamePath: string
  steamAppId?: string
  prefixPath: string
  libraryPath?: string
}

function findSteamAppPath(appId: string): { gamePath: string; libraryPath: string } | null {
  const libraries = findAllSteamLibraries();
  for (const lib of libraries) {
    const manifest = path.join(lib, `appmanifest_${appId}.acf`);
    if (!fs.existsSync(manifest)) continue;
    try {
      const content = fs.readFileSync(manifest, "utf-8");
      const match = content.match(/"installdir"\s*"([^"]+)"/);
      if (match) {
        const gamePath = path.join(lib, "common", match[1]);
        if (fs.existsSync(gamePath)) {
          return { gamePath, libraryPath: lib };
        }
      }
    } catch { continue; }
  }
  return null;
}

function steamCompatDataPath(libraryPath: string, steamAppId: string): string | null {
  const compatData = path.join(libraryPath, "compatdata", steamAppId);
  return fs.existsSync(compatData) ? path.join(compatData, "pfx") : null;
}

function defaultStagingDir(gameId: string): string {
  const slug = gameId.toLowerCase().replace(/[\s:/\\]+/g, "-").replace(/[^a-z0-9-]/g, "");
  return path.join(os.homedir(), "Games", "Mods", slug, "staging");
}

export function defaultPrefixDir(gameId: string): string {
  const slug = gameId.toLowerCase().replace(/[\s:/\\]+/g, "-").replace(/[^a-z0-9-]/g, "");
  return path.join(os.homedir(), "Games", "Prefix", slug);
}

export async function detectGame(
  gameId: string,
  send: SendProgress,
): Promise<DetectResult | PlayResult> {
  send("detect", "🔍 Detectando jogo nas bibliotecas Steam...", "working");

  let config = ModStorageService.get<any>(`game:${gameId}:config`);
  let gamePath = config?.gamePath;
  const info = getGameInfo(gameId);
  const mod = getGameModule(gameId);

  if (!gamePath) {
    let gogPrefix: string | null = null;

    if (info?.steamAppId) {
      const found = findSteamAppPath(info.steamAppId);
      if (found) {
        gamePath = found.gamePath;
        const staging = defaultStagingDir(gameId);
        const steamPrefix = steamCompatDataPath(found.libraryPath, info.steamAppId);
        const prefix = steamPrefix || defaultPrefixDir(gameId);

        ModStorageService.put(`game:${gameId}:config`, {
          gamePath,
          stagingDir: staging,
          protonPrefix: prefix,
          protonVersion: "",
        });

        send("detect", `✅ Jogo encontrado via Steam: ${path.basename(gamePath)}`, "done");
        return {
          gameId,
          gamePath,
          steamAppId: info.steamAppId,
          prefixPath: prefix,
          libraryPath: found.libraryPath,
        };
      }
    }

    const gog = findGogGamePath(gameId);
    if (gog) {
      gamePath = gog.gamePath;
      const staging = defaultStagingDir(gameId);
      const prefix = gogPrefix || defaultPrefixDir(gameId);

      ModStorageService.put(`game:${gameId}:config`, {
        gamePath,
        stagingDir: staging,
        protonPrefix: prefix,
        protonVersion: "",
      });

      send("detect", `✅ Jogo encontrado via ${gog.source === "heroic" ? "Heroic (GOG)" : "GOG"}: ${path.basename(gamePath)}`, "done");
      return {
        gameId,
        gamePath,
        prefixPath: prefix,
      };
    }

    const isSteamGame = info?.steamAppId ? ` (App ID: ${info.steamAppId})` : "";
    send("detect", `❌ Jogo${isSteamGame} não encontrado no Steam nem GOG. Configure manualmente em Configurações.`, "error", "config");
    return {
      success: false,
      error: `Jogo${isSteamGame} não encontrado. Verifique se está instalado ou configure manualmente.`,
    };
  }

  // Game path already configured
  if (!fs.existsSync(gamePath)) {
    send("detect", `❌ Caminho configurado não existe: ${gamePath}`, "error", "config");
    return { success: false, error: `Caminho não encontrado: ${gamePath}` };
  }

  // Validate it's actually this game
  if (!mod.detect(gamePath)) {
    send("detect", `⚠️ ${path.basename(gamePath)} não parece ser ${info?.name || gameId}`, "done");
  } else {
    send("detect", `✅ Jogo encontrado: ${path.basename(gamePath)}`, "done");
  }

  const rawPrefix = config?.protonPrefix || defaultPrefixDir(gameId);
  const prefixPath = rawPrefix.startsWith("~") ? rawPrefix.replace("~", os.homedir()) : rawPrefix;
  const steamAppId = info?.steamAppId;

  // Derive libraryPath from gamePath (e.g. /.../steamapps/common/Skyrim → /.../steamapps)
  let libraryPath: string | undefined;
  const commonIdx = gamePath.lastIndexOf(path.sep + "common" + path.sep);
  if (commonIdx !== -1) {
    libraryPath = gamePath.slice(0, commonIdx);
  } else {
    // Try to derive from prefixPath (e.g. /.../compatdata/72850/pfx → /.../steamapps)
    const compatIdx = prefixPath.lastIndexOf(path.sep + "compatdata" + path.sep);
    if (compatIdx !== -1) {
      libraryPath = prefixPath.slice(0, compatIdx);
    }
  }

  return {
    gameId,
    gamePath,
    steamAppId,
    prefixPath,
    libraryPath,
  };
}

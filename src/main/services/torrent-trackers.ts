import path from "node:path";
import fs from "node:fs";
import { app } from "electron";

/**
 * Carrega a lista de trackers do torrent-tracker-list.txt.
 * Inclui os fallbacks de caminho da versão antiga (resources/binaries)
 * para funcionar tanto em dev quanto em builds empacotados.
 */
function loadTrackerList(): string[] {
  const possiblePaths = [
    app.isPackaged
      ? path.join(
          process.resourcesPath,
          "app",
          "_resources",
          "binaries",
          "torrent-tracker-list.txt"
        )
      : null,
    app.isPackaged
      ? path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          "app",
          "_resources",
          "binaries",
          "torrent-tracker-list.txt"
        )
      : null,
    app.isPackaged
      ? path.join(process.resourcesPath, "torrent-tracker-list.txt")
      : null,
    path.join(
      app.getAppPath(),
      "app",
      "_resources",
      "binaries",
      "torrent-tracker-list.txt"
    ),
    path.join(
      app.getAppPath(),
      "resources",
      "binaries",
      "torrent-tracker-list.txt"
    ),
  ].filter(Boolean) as string[];

  for (const file of possiblePaths) {
    try {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, "utf-8");
        const trackers = content
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#"));
        if (trackers.length > 0) return trackers;
      }
    } catch {
      // tenta o próximo caminho
    }
  }

  return [];
}

let trackerCache: string[] | null = null;

export function getTrackers(): string[] {
  if (trackerCache === null || trackerCache.length === 0) {
    trackerCache = loadTrackerList();
  }
  return trackerCache;
}

/**
 * Normaliza uma URI de download: remove espaços/CR, quebras de linha e
 * decodifica entidades HTML (ex.: `&amp;` -> `&`) que quebram magnets e URLs.
 */
export function normalizeDownloadUri(uri: string): string {
  let out = uri.trim();
  out = out.replace(/[\r\n]+/g, "");
  out = out.replace(/&amp;/g, "&");
  out = out.replace(/&lt;/g, "<");
  out = out.replace(/&gt;/g, ">");
  out = out.replace(/&quot;/g, "\"");
  out = out.replace(/&#39;/g, "'");
  return out;
}

/**
 * Anexa os trackers ao magnet — sempre anexa os da lista que ainda não
 * existem no magnet (deduplicando), mesmo que o magnet já tenha trackers
 * próprios. Na versão antiga o comportamento era o mesmo (append incondicional).
 */
export function appendTrackersToMagnet(uri: string, trackers: string[]): string {
  if (!uri.startsWith("magnet:") || trackers.length === 0) return uri;

  const existing = new Set<string>(
    [...uri.matchAll(/[?&]tr=([^&]+)/g)].map((m) => decodeURIComponent(m[1]))
  );

  const toAdd = trackers.filter((t) => !existing.has(t));
  if (toAdd.length === 0) return uri;

  return uri + toAdd.map((t) => "&tr=" + encodeURIComponent(t)).join("");
}

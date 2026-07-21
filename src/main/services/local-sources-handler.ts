import path from "node:path";
import fs from "node:fs";
import { app } from "electron";

interface SourceConfig {
  name: string;
  file: string;
}

function getSourceFiles(): SourceConfig[] {
  const dir = getSourcesDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
        return { name: data.name || f.replace(/\.json$/, ""), file: f };
      } catch {
        return { name: f.replace(/\.json$/, ""), file: f };
      }
    });
}

function getSourcesDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "data", "sources");
  }
  return path.join(app.getAppPath(), "app", "_data", "sources");
}

interface SourceData {
  name?: string;
  downloads?: Array<{
    title: string;
    uris?: string[];
    fileSize?: string;
    uploadDate?: string;
  }>;
}

const dataCache = new Map<string, { data: SourceData }>();

function getSourceData(config: SourceConfig): SourceData | null {
  const cached = dataCache.get(config.file);
  if (cached) return cached.data;

  const filePath = path.join(getSourcesDir(), config.file);
  if (!fs.existsSync(filePath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as SourceData;
    dataCache.set(config.file, { data });
    return data;
  } catch {
    return null;
  }
}

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function titleMatches(searchTitle: string, sourceTitle: string): boolean {
  const a = normalize(searchTitle);
  const b = normalize(sourceTitle);
  if (a.length < 3 || b.length < 3) return false;
  return b.includes(a) || a.includes(b);
}

export function handleGetDownloadSources(): Array<{
  id: string;
  name: string;
  url: string;
  status: string;
  downloadCount: number;
  fingerprint: string;
  createdAt: string;
}> {
  return getSourceFiles().map((config, i) => {
    const data = getSourceData(config);
    const count = data?.downloads?.length || 0;
    return {
      id: `gh_${i}`,
      name: config.name,
      url: `local://${config.file}`,
      status: "matched",
      downloadCount: count,
      fingerprint: config.name,
      createdAt: new Date().toISOString(),
    };
  });
}

export interface EmbeddedDownload {
  title: string;
  uris: string[];
  fileSize?: string | null;
  uploadDate?: string | null;
  recommended?: boolean;
  downloadSourceName?: string;
}

export function handleGetGameDownloadSources(
  _shop: string,
  objectId: string,
  title: string,
  embeddedDownloads?: EmbeddedDownload[]
): Array<{
  id: string;
  title: string;
  fileSize: string | null;
  uris: string[];
  unavailableUris: string[];
  uploadDate: string | null;
  downloadSourceId: string;
  downloadSourceName: string;
  createdAt: string;
  recommended?: boolean;
}> {
  if (!title && !objectId) return [];

  const results: Array<any> = [];
  const seenUris = new Set<string>();

  const addResult = (dl: any, sourceId: string, sourceName: string) => {
    const uris = dl.uris || [];
    if (uris.length > 0) {
      const uriKey = uris.join("|");
      if (seenUris.has(uriKey)) return;
      seenUris.add(uriKey);
    }
    results.push({
      id: dl.title,
      title: dl.title,
      fileSize: dl.fileSize || null,
      uris,
      unavailableUris: [],
      uploadDate: dl.uploadDate || null,
      downloadSourceId: sourceId,
      downloadSourceName: sourceName,
      createdAt: new Date().toISOString(),
      recommended: dl.recommended || false,
    });
  };

  // Always collect embedded downloads first
  if (embeddedDownloads && embeddedDownloads.length > 0) {
    for (const dl of embeddedDownloads) {
      addResult(dl, dl.downloadSourceName || "embedded", dl.downloadSourceName || "Embedded");
    }
  }

  // Then scan all source files for additional matches
  for (const config of getSourceFiles()) {
    try {
      const data = getSourceData(config);
      if (!data?.downloads) continue;

      const sourceName = data.name || config.name;

      for (const dl of data.downloads) {
          if (objectId && (dl as any).steamId && (dl as any).steamId === objectId) {
            addResult(dl, config.name, sourceName);
            continue;
          }

          if (title && titleMatches(title, dl.title)) {
            addResult(dl, config.name, sourceName);
          }
      }
    } catch {}
  }

  return results;
}

export function handleGetSourceNamesForTitle(title: string): string[] {
  if (!title) return [];
  const matched = new Set<string>();

  for (const config of getSourceFiles()) {
    try {
      const data = getSourceData(config);
      if (!data?.downloads) continue;
      for (const dl of data.downloads) {
        if (titleMatches(title, dl.title)) {
          matched.add(config.name);
          break;
        }
      }
    } catch {}
  }

  return Array.from(matched);
}

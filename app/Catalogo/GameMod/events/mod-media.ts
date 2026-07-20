import { registerEvent } from "@main/events/register-event";
import path from "node:path";
import fs from "node:fs";
import { getGameModule } from "@games/registry";
import { walkDir } from "@mods/games/_shared/filemap";

registerEvent("listModFiles", async (_event, stagingDir: string) => {
  const fs = await import("node:fs");

  function walk(dir: string, relativePath = ""): { name: string; path: string; isDirectory: boolean; children: any[] }[] {
    const entries: { name: string; path: string; isDirectory: boolean; children: any[] }[] = [];
    try {
      const dirEntries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of dirEntries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          entries.push({
            name: entry.name,
            path: relPath,
            isDirectory: true,
            children: walk(fullPath, relPath),
          });
        } else {
          entries.push({ name: entry.name, path: relPath, isDirectory: false, children: [] });
        }
      }
    } catch {}
    return entries;
  }

  return walk(stagingDir);
});

registerEvent("listDataFolder", async (_event, gamePath: string, gameId?: string) => {
  function walk(dir: string, relativePath = ""): any[] {
    const entries: any[] = [];
    try {
      const dirEntries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of dirEntries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          entries.push({ name: entry.name, path: relPath, isDirectory: true, children: walk(fullPath, relPath) });
        } else {
          entries.push({ name: entry.name, path: relPath, isDirectory: false, children: [] });
        }
      }
    } catch {}
    return entries;
  }

  const targetDir = gameId
    ? getGameModule(gameId, gamePath).getDeployTarget(gamePath)
    : path.join(gamePath, "Data");
  return walk(targetDir);
});

registerEvent("readModFile", async (_event, filePath: string) => {
  const fs = await import("node:fs");
  const ext = path.extname(filePath).toLowerCase();
  const imageExts = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"]);
  const textExts = new Set([".txt", ".md", ".htm", ".html", ".rtf"]);

  try {
    if (imageExts.has(ext)) {
      const data = fs.readFileSync(filePath);
      return { type: "image", content: data.toString("base64"), ext };
    }
    if (textExts.has(ext)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return { type: "text", content, ext };
    }
    return null;
  } catch {
    return null;
  }
});

registerEvent("checkModsMedia", async (_event, stagingDirs: string[]) => {
  const fs = await import("node:fs");
  const imageExts = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"]);
  const textExts = new Set([".txt", ".md", ".htm", ".html", ".rtf"]);
  const readmePatterns = ["readme", "leia", "install", "instruç", "instruc", "about", "descriç", "descric", "info"];

  const result: Record<string, { hasPreview: boolean; hasReadme: boolean }> = {};

  for (const stagingDir of stagingDirs) {
    let hasPreview = false;
    let hasReadme = false;

    try {
      const scanDir = (dir: string) => {
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { return; }
        for (const entry of entries) {
          if (hasPreview && hasReadme) return;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (!hasPreview && imageExts.has(ext)) hasPreview = true;
            if (!hasReadme && textExts.has(ext)) {
              const nameNoExt = path.basename(entry.name, ext).toLowerCase();
              const parentDir = path.basename(path.dirname(fullPath)).toLowerCase();
              if (readmePatterns.some(p => nameNoExt.includes(p)) || readmePatterns.some(p => parentDir.includes(p))) hasReadme = true;
            }
          }
        }
      };
      scanDir(stagingDir);
    } catch {}

    result[stagingDir] = { hasPreview, hasReadme };
  }

  return result;
});

registerEvent("scanModFolder", async (_event, dirPath: string, scanType: "image" | "readme") => {
  const imageExts = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"]);
  const textExts = new Set([".txt", ".md", ".htm", ".html", ".rtf"]);
  const readmePatterns = ["readme", "leia", "install", "instruç", "instruc", "about", "descriç", "descric", "info"];
  const results: { fullPath: string; name: string }[] = [];

  try {
    walkDir(dirPath, (fullPath, _relativePath) => {
      const ext = path.extname(fullPath).toLowerCase();
      const nameNoExt = path.basename(fullPath, ext).toLowerCase();
      const name = path.basename(fullPath);

      if (scanType === "image" && imageExts.has(ext)) {
        results.push({ fullPath, name });
      }

      if (scanType === "readme" && textExts.has(ext)) {
        const parentDir = path.basename(path.dirname(fullPath)).toLowerCase();
        if (readmePatterns.some(p => nameNoExt.includes(p)) || readmePatterns.some(p => parentDir.includes(p))) {
          results.push({ fullPath, name });
        }
      }
    });
  } catch {}

  return results;
});

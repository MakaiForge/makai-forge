import fs from "node:fs";
import path from "node:path";
import type { ArchiveInvalidationConfig } from "../_shared/types";
import { findPrefixUsername } from "../_shared/filemap";

const BSA_HEADER = Buffer.alloc(36);
BSA_HEADER.write("BSA\x00", 0, 4, "ascii");

export function writeDummyBsa(bsaPath: string, version: number): void {
  const dir = path.dirname(bsaPath);
  fs.mkdirSync(dir, { recursive: true });
  const header = Buffer.alloc(36);
  header.write("BSA\x00", 0, 4, "ascii");
  header.writeUInt32BE(version, 8);
  fs.writeFileSync(bsaPath, header);
}

export function deleteDummyBsa(bsaPath: string): void {
  try {
    if (fs.existsSync(bsaPath)) fs.unlinkSync(bsaPath);
  } catch { /* skip */ }
}

export function ensureInArchiveList(current: string, entry: string): string {
  const items = current ? current.split(",").map(s => s.trim()).filter(Boolean) : [];
  if (items.some(i => i.toLowerCase() === entry.toLowerCase())) return current;
  items.push(entry);
  return items.join(",");
}

export function removeFromArchiveList(current: string, entry: string): string {
  const items = current ? current.split(",").map(s => s.trim()).filter(Boolean) : [];
  const filtered = items.filter(i => i.toLowerCase() !== entry.toLowerCase());
  return filtered.join(",");
}

export function removeManyFromArchiveList(current: string, entries: string[]): string {
  const lower = new Set(entries.map(e => e.toLowerCase()));
  const items = current ? current.split(",").map(s => s.trim()).filter(Boolean) : [];
  return items.filter(i => !lower.has(i.toLowerCase())).join(",");
}

export function appendToArchiveList(current: string, entries: string[]): string {
  const items = current ? current.split(",").map(s => s.trim()).filter(Boolean) : [];
  const existing = new Set(items.map(i => i.toLowerCase()));
  for (const entry of entries) {
    if (!existing.has(entry.toLowerCase())) {
      items.push(entry);
      existing.add(entry.toLowerCase());
    }
  }
  return items.join(",");
}

export function setIniKey(iniPath: string, section: string, key: string, value: string | null): void {
  if (!fs.existsSync(iniPath)) {
    if (value === null) return;
    fs.writeFileSync(iniPath, `[${section}]\n${key}=${value}\n`, "utf-8");
    return;
  }

  let text = fs.readFileSync(iniPath, "utf-8");
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(newline);
  const sectionHeader = `[${section}]`;
  const sectionRe = /^\s*\[([^\]]+)\]\s*$/;
  const keyRe = new RegExp(`^\\s*${escapeRegex(key)}\\s*=`);

  let sectionStart = -1;
  let sectionEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const m = sectionRe.exec(lines[i]);
    if (!m) continue;
    if (sectionStart === -1 && m[1].trim() === section) sectionStart = i;
    else if (sectionStart !== -1) { sectionEnd = i; break; }
  }

  if (sectionStart === -1) {
    if (value === null) return;
    if (lines[lines.length - 1] !== "") lines.push("");
    lines.push(sectionHeader);
    lines.push(`${key}=${value}`);
    lines.push("");
  } else {
    let keyLine = -1;
    for (let i = sectionStart + 1; i < sectionEnd; i++) {
      if (keyRe.test(lines[i])) { keyLine = i; break; }
    }
    if (value === null) {
      if (keyLine !== -1) {
        lines.splice(keyLine, 1);
        sectionEnd--;
      }
      const hasContent = lines.slice(sectionStart + 1, sectionEnd).some(
        ln => ln.trim() && !ln.trim().startsWith(";") && !ln.trim().startsWith("#")
      );
      if (!hasContent) {
        let trail = sectionEnd;
        while (trail < lines.length && lines[trail] === "") trail++;
        lines.splice(sectionStart, trail - sectionStart);
      }
    } else {
      const newLine = `${key}=${value}`;
      if (keyLine !== -1) lines[keyLine] = newLine;
      else lines.splice(sectionEnd, 0, newLine);
    }
  }

  fs.writeFileSync(iniPath, lines.join(newline), "utf-8");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function readIniKey(iniPath: string, section: string, key: string): string | null {
  try {
    if (!fs.existsSync(iniPath)) return null;
    const text = fs.readFileSync(iniPath, "utf-8");
    const sectionRe = /^\s*\[([^\]]+)\]\s*$/;
    const keyRe = new RegExp(`^\\s*${escapeRegex(key)}\\s*=(.*)$`);
    let inSection = false;
    for (const line of text.split("\n")) {
      const sm = sectionRe.exec(line);
      if (sm) { inSection = sm[1].trim() === section; continue; }
      if (inSection) {
        const km = keyRe.exec(line);
        if (km) return km[1].trim();
      }
    }
  } catch { /* */ }
  return null;
}

export function applyInvalidation(
  config: ArchiveInvalidationConfig,
  gamePath: string,
  prefixPath: string | undefined,
  myGamesSubpath: string,
  modBsaNames?: string[],
): void {
  if (!config.enabled || !prefixPath) return;

  const username = findPrefixUsername(prefixPath) || "steamuser";
  const myGames = path.join(prefixPath, "drive_c/users", username, "Documents/My Games", myGamesSubpath);
  if (!fs.existsSync(myGames)) return;

  const iniPaths: string[] = [path.join(myGames, config.iniFilename)];
  if (config.prefsIniFilename) iniPaths.push(path.join(myGames, config.prefsIniFilename));

  for (const iniPath of iniPaths) {
    fs.mkdirSync(path.dirname(iniPath), { recursive: true });
    setIniKey(iniPath, "Archive", config.invalidationIniKey, "1");

    if (config.bsaName) {
      const bsaPath = path.join(gamePath, "Data", config.bsaName);
      writeDummyBsa(bsaPath, config.bsaVersion ?? 0x68);

      let current = readIniKey(iniPath, "Archive", config.archiveListKey) || "";
      let updated = ensureInArchiveList(current, config.bsaName);

      if (config.needsModBsas && modBsaNames) {
        updated = appendToArchiveList(updated, modBsaNames);
      }

      if (updated !== current) {
        setIniKey(iniPath, "Archive", config.archiveListKey, updated);
      }
      setIniKey(iniPath, "Archive", "SInvalidationFile", "");
    }
  }
}

export function revertInvalidation(
  config: ArchiveInvalidationConfig,
  gamePath: string,
  prefixPath: string | undefined,
  myGamesSubpath: string,
  modBsaNames?: string[],
): void {
  if (!config.enabled || !prefixPath) return;

  const username = findPrefixUsername(prefixPath) || "steamuser";
  const myGames = path.join(prefixPath, "drive_c/users", username, "Documents/My Games", myGamesSubpath);
  if (!fs.existsSync(myGames)) {
    if (config.bsaName) deleteDummyBsa(path.join(gamePath, "Data", config.bsaName));
    return;
  }

  const iniPaths: string[] = [path.join(myGames, config.iniFilename)];
  if (config.prefsIniFilename) iniPaths.push(path.join(myGames, config.prefsIniFilename));

  for (const iniPath of iniPaths) {
    setIniKey(iniPath, "Archive", config.invalidationIniKey, null);
    if (config.bsaName) {
      let current = readIniKey(iniPath, "Archive", config.archiveListKey) || "";
      let updated = removeFromArchiveList(current, config.bsaName);
      if (config.needsModBsas && modBsaNames) {
        updated = removeManyFromArchiveList(updated, modBsaNames);
      }
      setIniKey(iniPath, "Archive", config.archiveListKey, updated || null);
      setIniKey(iniPath, "Archive", "SInvalidationFile", null);
    }
  }

  if (config.bsaName) {
    deleteDummyBsa(path.join(gamePath, "Data", config.bsaName));
  }
}

export function deployedModBsas(dataDir: string): string[] {
  if (!fs.existsSync(dataDir)) return [];
  try {
    return fs.readdirSync(dataDir).filter(f => {
      const low = f.toLowerCase();
      return low.endsWith(".bsa") || low.endsWith(".ba2");
    });
  } catch { return []; }
}

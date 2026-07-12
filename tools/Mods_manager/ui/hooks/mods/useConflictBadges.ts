import { useMemo } from "react";
import type { ModlistEntry } from "../../types/mod.types";

export type ConflictType = "plugin" | "script" | "asset";

export interface ConflictFile {
  relativePath: string;
  mods: { name: string; priority: number }[];
  winner: string;
  type: ConflictType;
}

export interface ConflictDetails {
  conflicts: ConflictFile[];
  pluginConflicts: ConflictFile[];
  assetConflicts: ConflictFile[];
  scriptConflicts: ConflictFile[];
}

function classifyConflict(path: string): ConflictType {
  const lower = path.toLowerCase();
  if (lower.endsWith(".esp") || lower.endsWith(".esm") || lower.endsWith(".esl")) {
    return "plugin";
  }
  if (lower.includes("skse") || lower.includes("f4se") || lower.includes("nvse") || lower.includes("fose")) {
    return "script";
  }
  return "asset";
}

function getFilePriority(mods: { name: string; priority: number }[]): { winner: string; winnerPriority: number } {
  const sorted = [...mods].sort((a, b) => b.priority - a.priority);
  return { winner: sorted[0].name, winnerPriority: sorted[0].priority };
}

function isFomodInternal(path: string): boolean {
  const parts = path.split("/");
  for (const p of parts) {
    const pl = p.toLowerCase();
    if (pl === "fomod" || pl === "fom") return true;
  }
  return false;
}

const GAME_DIRS = new Set([
  "meshes", "textures", "sound", "music", "scripts", "interface",
  "fonts", "strings", "misc", "video", "seq", "skse", "tools",
  "calientetools", "facegendata",
]);

export function normalizeToDeployPath(path: string): string {
  let lower = path.toLowerCase();
  if (lower.startsWith("data/")) lower = lower.slice(5);
  const parts = lower.split("/");
  for (let i = 0; i < parts.length; i++) {
    if (GAME_DIRS.has(parts[i])) return parts.slice(i).join("/");
    if (parts[i].match(/\.(esp|esm|esl)$/)) return parts.slice(i).join("/");
  }
  return lower;
}

export function useConflictBadges(mods: ModlistEntry[]) {
  const { conflictSet, conflictDetails, allConflicts } = useMemo(() => {
    const enabledMods = mods.filter(m => m.enabled && !m.isSeparator);

    const fileToMods = new Map<string, { name: string; priority: number }[]>();
    const normalizedToMods = new Map<string, { name: string; priority: number }[]>();

    for (const mod of enabledMods) {
      const priority = mod.priority ?? mods.indexOf(mod);
      const files = mod.inventory?.files ?? [];

      for (const file of files) {
        const pathLower = file.relativePath?.toLowerCase() ?? file.toLowerCase();
        if (!pathLower) continue;
        if (isFomodInternal(pathLower)) continue;

        if (!fileToMods.has(pathLower)) fileToMods.set(pathLower, []);
        fileToMods.get(pathLower)!.push({ name: mod.name, priority });

        const normalized = normalizeToDeployPath(pathLower);
        if (normalized) {
          if (!normalizedToMods.has(normalized)) normalizedToMods.set(normalized, []);
          const existing = normalizedToMods.get(normalized)!;
          if (!existing.some(e => e.name === mod.name)) {
            existing.push({ name: mod.name, priority });
          }
        }
      }

      if (mod.plugins) {
        for (const plugin of mod.plugins) {
          const pluginLower = plugin.toLowerCase();
          if (!fileToMods.has(pluginLower)) fileToMods.set(pluginLower, []);
          const owners = fileToMods.get(pluginLower)!;
          if (!owners.some(o => o.name === mod.name)) owners.push({ name: mod.name, priority });
        }
      }
    }

    const conflicted = new Set<string>();
    const details: Record<string, { plugins: string[]; mods: string[] }> = {};
    const allConflictsList: ConflictFile[] = [];
    const pluginConflictsList: ConflictFile[] = [];
    const assetConflictsList: ConflictFile[] = [];
    const scriptConflictsList: ConflictFile[] = [];

    function addConflict(conflict: ConflictFile) {
      allConflictsList.push(conflict);
      if (conflict.type === "plugin") pluginConflictsList.push(conflict);
      else if (conflict.type === "script") scriptConflictsList.push(conflict);
      else assetConflictsList.push(conflict);

      for (const owner of conflict.mods) {
        conflicted.add(owner.name);
        if (!details[owner.name]) details[owner.name] = { plugins: [], mods: [] };
        const displayName = conflict.relativePath.split("/").pop() ?? conflict.relativePath;
        if (!details[owner.name].plugins.includes(displayName)) details[owner.name].plugins.push(displayName);
        for (const other of conflict.mods) {
          if (other.name !== owner.name && !details[owner.name].mods.includes(other.name)) {
            details[owner.name].mods.push(other.name);
          }
        }
      }
    }

    for (const [filePath, owners] of fileToMods) {
      if (owners.length > 1) {
        const { winner } = getFilePriority(owners);
        addConflict({
          relativePath: filePath,
          mods: owners.sort((a, b) => b.priority - a.priority),
          winner,
          type: classifyConflict(filePath),
        });
      }
    }

    const seenNormalized = new Set<string>();
    for (const [normalizedPath, owners] of normalizedToMods) {
      if (owners.length > 1) {
        const key = owners.map(o => o.name).sort().join("|") + "::" + normalizedPath;
        if (seenNormalized.has(key)) continue;
        seenNormalized.add(key);

        const { winner } = getFilePriority(owners);
        addConflict({
          relativePath: normalizedPath,
          mods: owners.sort((a, b) => b.priority - a.priority),
          winner,
          type: classifyConflict(normalizedPath),
        });
      }
    }

    const conflictDetails: ConflictDetails = {
      conflicts: allConflictsList,
      pluginConflicts: pluginConflictsList,
      assetConflicts: assetConflictsList,
      scriptConflicts: scriptConflictsList,
    };

    return { conflictSet: conflicted, conflictDetails: details, allConflicts: conflictDetails };
  }, [mods]);

  return { conflictSet, conflictDetails, allConflicts };
}

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

export function useConflictBadges(mods: ModlistEntry[]) {
  const { conflictSet, conflictDetails, allConflicts } = useMemo(() => {
    const enabledMods = mods.filter(m => m.enabled && !m.isSeparator);

    // Build file-to-mods mapping from inventory
    const fileToMods = new Map<string, { name: string; priority: number }[]>();

    for (const mod of enabledMods) {
      const priority = mod.priority ?? mods.indexOf(mod);
      const files = mod.inventory?.files ?? [];

      for (const file of files) {
        const pathLower = file.relativePath?.toLowerCase() ?? file.toLowerCase();
        if (!pathLower) continue;

        if (!fileToMods.has(pathLower)) {
          fileToMods.set(pathLower, []);
        }
        fileToMods.get(pathLower)!.push({ name: mod.name, priority });
      }

      // Also check plugins for plugin-level conflicts
      // (skip if already added from inventory to avoid self-conflicts)
      if (mod.plugins) {
        for (const plugin of mod.plugins) {
          const pluginLower = plugin.toLowerCase();
          if (!fileToMods.has(pluginLower)) {
            fileToMods.set(pluginLower, []);
          }
          const owners = fileToMods.get(pluginLower)!;
          if (!owners.some(o => o.name === mod.name)) {
            owners.push({ name: mod.name, priority });
          }
        }
      }
    }

    // Detect conflicts (files owned by 2+ mods)
    const conflicted = new Set<string>();
    const details: Record<string, { plugins: string[]; mods: string[] }> = {};
    const allConflictsList: ConflictFile[] = [];
    const pluginConflictsList: ConflictFile[] = [];
    const assetConflictsList: ConflictFile[] = [];
    const scriptConflictsList: ConflictFile[] = [];

    for (const [filePath, owners] of fileToMods) {
      if (owners.length > 1) {
        const { winner } = getFilePriority(owners);
        const type = classifyConflict(filePath);

        const conflict: ConflictFile = {
          relativePath: filePath,
          mods: owners.sort((a, b) => b.priority - a.priority),
          winner,
          type,
        };

        allConflictsList.push(conflict);

        if (type === "plugin") pluginConflictsList.push(conflict);
        else if (type === "script") scriptConflictsList.push(conflict);
        else assetConflictsList.push(conflict);

        // Add to per-mod details
        for (const owner of owners) {
          conflicted.add(owner.name);

          if (!details[owner.name]) {
            details[owner.name] = { plugins: [], mods: [] };
          }

          // Add the conflicting file name for display
          const displayName = filePath.split("/").pop() ?? filePath;
          if (!details[owner.name].plugins.includes(displayName)) {
            details[owner.name].plugins.push(displayName);
          }

          // Add other mods involved
          for (const other of owners) {
            if (other.name !== owner.name && !details[owner.name].mods.includes(other.name)) {
              details[owner.name].mods.push(other.name);
            }
          }
        }
      }
    }

    const conflictDetails: ConflictDetails = {
      conflicts: allConflictsList,
      pluginConflicts: pluginConflictsList,
      assetConflicts: assetConflictsList,
      scriptConflicts: scriptConflictsList,
    };

    return {
      conflictSet: conflicted,
      conflictDetails: details,
      allConflicts: conflictDetails,
    };
  }, [mods]);

  return { conflictSet, conflictDetails, allConflicts };
}

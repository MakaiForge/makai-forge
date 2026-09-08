import type { ModInventory, FileConflict } from "@types";
import { ModStorageService } from "./mod-storage-service";

export class ModConflictService {

  static async detectConflicts(
    gameId: string,
    enabledMods: { name: string; priority: number }[]
  ): Promise<FileConflict[]> {
    const inventories: { name: string; priority: number; inventory: ModInventory }[] = [];
    for (const mod of enabledMods) {
      const invKey = `game:${gameId}:mod:${mod.name}:inventory`;
      const inv: ModInventory | undefined = ModStorageService.get(invKey);
      if (inv) inventories.push({ ...mod, inventory: inv });
    }

    const fileMap = new Map<string, { name: string; priority: number }[]>();
    for (const { name, priority, inventory } of inventories) {
      for (const file of inventory.files) {
        const owners = fileMap.get(file.relativePathLower) || [];
        if (owners.length === 0) fileMap.set(file.relativePathLower, owners);
        owners.push({ name, priority });
      }
    }

    const conflicts: FileConflict[] = [];
    for (const [pathLower, owners] of fileMap) {
      if (owners.length < 2) continue;
      owners.sort((a, b) => b.priority - a.priority);
      const ext = pathLower.split(".").pop() || "";
      const isPlugin = ["esp", "esm", "esl"].includes(ext);
      const isScript = pathLower.includes("skse") || pathLower.includes("f4se");

      conflicts.push({
        relativePath: pathLower,
        mods: owners.map(o => ({ name: o.name, priority: o.priority })),
        winner: owners[0].name,
        type: isPlugin ? "plugin" : isScript ? "script" : "asset",
      });
    }

    return conflicts;
  }
}

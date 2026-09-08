import type {
  FomodConfig,
  PluginEntry,
} from "@types";
import { ProtonRecommendationService } from "@provision/proton_recommended/services/proton-recommendation";
import fs from "node:fs";

export class ModManagerService {
  static async parseFomod(modPath: string): Promise<FomodConfig> {
    return ProtonRecommendationService.request<FomodConfig>("mod_fomod_parse", {
      mod_path: modPath,
    });
  }

  static async installFomod(
    modPath: string,
    selections: Record<string, string[]>
  ): Promise<{ success: boolean; files: string[]; failed: string[] }> {
    return ProtonRecommendationService.request("mod_fomod_install", {
      mod_path: modPath,
      selections,
    });
  }

  static readPlugins(
    path: string,
    starPrefix = true
  ): PluginEntry[] {
    try {
      const content = fs.readFileSync(path, "utf-8");
      const entries: PluginEntry[] = [];
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        if (starPrefix && trimmed.startsWith("*")) {
          entries.push({ name: trimmed.slice(1).trim(), enabled: true });
        } else if (!starPrefix) {
          entries.push({ name: trimmed, enabled: true });
        } else {
          entries.push({ name: trimmed, enabled: false });
        }
      }
      return entries;
    } catch {
      return [];
    }
  }

  static writePlugins(
    path: string,
    entries: PluginEntry[],
    starPrefix = true
  ): boolean {
    try {
      const lines = entries.map(e =>
        e.enabled && starPrefix ? `*${e.name}` : e.name
      );
      fs.writeFileSync(path, lines.join("\n") + "\n", "utf-8");
      return true;
    } catch {
      return false;
    }
  }
}

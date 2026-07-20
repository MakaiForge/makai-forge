import fs from "node:fs";
import path from "node:path";
import { analyzeMod } from "./analyzer";
import { applySkyrimRules } from "./rules/skyrim-rules";
import type { ModStructure, ModFileEntry, InstallPlan, InstallStep } from "./types";
import { parseFomodXml, resolveFomodFiles } from "@mods/services/fomod/fomod-parser";
import type { FomodConfig } from "@mods/services/fomod/fomod-types";

export type { ModStructure, ModFileEntry, InstallPlan, InstallStep } from "./types";

export class ModInstaller {
  /**
   * Analisa um mod extraído e retorna um plano de instalação completo.
   */
  static plan(stagingDir: string): InstallPlan {
    const structure = analyzeMod(stagingDir);
    const modName = path.basename(stagingDir);

    let files: ModFileEntry[];
    if (structure.hasFomod) {
      const xmlPath = this.findFomodConfig(stagingDir);
      if (xmlPath) {
        const config = parseFomodXml(xmlPath);
        if (config && config.steps.length > 0) {
          return {
            modName,
            structure,
            steps: [{ type: "fomod", source: stagingDir, destination: "" }],
          };
        }
      }
      files = [];
    } else {
      files = applySkyrimRules(structure.files, structure, stagingDir);
    }

    const steps: InstallStep[] = files.map(f => ({
      type: "copy",
      source: f.source,
      destination: f.destination,
    }));

    if (structure.category === "skse-loader") {
      steps.unshift({
        type: "skse-deploy",
        source: stagingDir,
        destination: "",
      });
    }

    return { modName, structure, steps };
  }

  /**
   * Executa o plano de instalação.
   */
  static async install(
    stagingDir: string,
    targetDataDir: string,
    selections?: Record<string, string[]>
  ): Promise<{ filesCopied: number; log: string[] }> {
    const log: string[] = [];
    const plan = this.plan(stagingDir);

    if (plan.structure.hasFomod && selections) {
      return this.installFomod(stagingDir, targetDataDir, selections);
    }

    let filesCopied = 0;
    for (const step of plan.steps) {
      if (step.type === "skse-deploy") {
        log.push("SKSE script extender detected — deploying to game root");
        continue;
      }
      if (step.type !== "copy") continue;

      const destPath = path.join(targetDataDir, step.destination);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      if (fs.existsSync(step.source) && fs.statSync(step.source).isFile()) {
        fs.copyFileSync(step.source, destPath);
        filesCopied++;
      }
    }

    log.push(`Installed ${filesCopied} files`);
    return { filesCopied, log };
  }

  private static async installFomod(
    stagingDir: string,
    targetDir: string,
    selections: Record<string, string[]>
  ): Promise<{ filesCopied: number; log: string[] }> {
    const { FomodService } = await import("@mods/services/fomod/fomod-service");
    return FomodService.install(stagingDir, targetDir, selections);
  }

  private static findFomodConfig(stagingDir: string): string | null {
    const { FomodService } = require("@mods/services/fomod/fomod-service");
    return FomodService.findConfig(stagingDir);
  }
}

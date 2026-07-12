import fs from "node:fs";
import path from "node:path";
import { parseFomodXml, resolveFomodFiles } from "./fomod-parser";
import type { FomodConfig } from "./fomod-types";
import type { FomodComponent } from "@types";

export class FomodService {
  /** Find the ModuleConfig.xml in a mod's staging directory.
   *  Searches root, then first-level subdirectories (for mods with nested FOMOD). */
  static findConfig(stagingDir: string): string | null {
    const candidates = ["fomod", "Fomod", "FOMOD"];

    // Check root level first
    for (const name of candidates) {
      const fomodDir = path.join(stagingDir, name);
      if (fs.existsSync(fomodDir)) {
        const xml = this.findXmlInDir(fomodDir);
        if (xml) return xml;
      }
    }

    // Check first-level subdirectories (e.g., "Bijin Wairmaidens NeverNude CBBE/Fomod/")
    try {
      const entries = fs.readdirSync(stagingDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        for (const name of candidates) {
          const fomodDir = path.join(stagingDir, entry.name, name);
          if (fs.existsSync(fomodDir)) {
            const xml = this.findXmlInDir(fomodDir);
            if (xml) return xml;
          }
        }
      }
    } catch { /* ignore */ }

    return null;
  }

  private static findXmlInDir(fomodDir: string): string | null {
    const candidates = [
      path.join(fomodDir, "ModuleConfig.xml"),
      path.join(fomodDir, "moduleconfig.xml"),
      path.join(fomodDir, "ModuleConfig.Xml"),
    ];

    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }

    const entries = fs.readdirSync(fomodDir);
    for (const e of entries) {
      if (e.toLowerCase().endsWith(".xml")) {
        return path.join(fomodDir, e);
      }
    }

    return null;
  }

  static parse(stagingDir: string): FomodConfig | null {
    const xmlPath = this.findConfig(stagingDir);
    if (!xmlPath) return null;
    return parseFomodXml(xmlPath);
  }

  static async install(
    stagingDir: string,
    targetDir: string,
    selections: Record<string, string[]>
  ): Promise<{ success: boolean; log: string[]; filesCopied: number }> {
    const result = await this.installWithComponents(stagingDir, targetDir, selections, false);
    return { success: result.success, log: result.log, filesCopied: result.filesCopied };
  }

  /**
   * Install FOMOD with optional component tracking.
   * When `captureComponents` is true, keeps ALL files (no cleanup) and returns
   * a component→files mapping so the UI can toggle sub-mods later.
   */
  static async installWithComponents(
    stagingDir: string,
    targetDir: string,
    selections: Record<string, string[]>,
    captureComponents: boolean = false,
  ): Promise<{
    success: boolean;
    log: string[];
    filesCopied: number;
    components: FomodComponent[];
  }> {
    const log: string[] = [];
    const config = this.parse(stagingDir);
    if (!config) {
      return { success: false, log: ["No FOMOD config found"], filesCopied: 0, components: [] };
    }

    const pairs = resolveFomodFiles(config, selections);
    log.push(`Resolved ${pairs.length} file pairs from FOMOD selection`);

    let filesCopied = 0;
    const copied: string[] = [];

    try {
      for (const pair of pairs) {
        const sourcePath = path.join(stagingDir, pair.source);

        if (!fs.existsSync(sourcePath)) {
          log.push(`Source not found: ${pair.source}`);
          continue;
        }

        const isDir = fs.statSync(sourcePath).isDirectory();
        const effectiveDest = pair.destination || (isDir ? "" : pair.source);
        const destPath = path.join(targetDir, effectiveDest);

        fs.mkdirSync(path.dirname(destPath), { recursive: true });

        if (isDir) {
          this.copyRecursive(sourcePath, destPath, copied);
        } else {
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          fs.copyFileSync(sourcePath, destPath);
          copied.push(destPath);
          filesCopied++;
        }
      }

      log.push(`Copied ${filesCopied} files from FOMOD selections`);

      // Build component→files mapping BEFORE any cleanup
      let components: FomodComponent[] = [];
      if (captureComponents) {
        components = this.buildComponentMap(config, selections, stagingDir, targetDir);
        log.push(`Captured ${components.length} component(s) for toggle UI`);
      }

      // Only cleanup when NOT capturing components (legacy behavior)
      if (!captureComponents) {
        const removed = this.cleanupNonSelected(stagingDir, copied);
        log.push(`Cleaned up ${removed} non-selected files/directories`);
      }

      return { success: true, log, filesCopied, components };
    } catch (err) {
      log.push(`FOMOD install failed: ${String(err)}. Rolling back...`);
      for (const filePath of copied) {
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch { /* skip */ }
      }
      log.push(`Rolled back ${copied.length} files`);
      return { success: false, log, filesCopied, components: [] };
    }
  }

  /**
   * Build a component→files mapping from FOMOD config and selections.
   * Each plugin in a SelectAny/SelectExactlyOne group becomes a toggleable component.
   */
  private static buildComponentMap(
    config: FomodConfig,
    selections: Record<string, string[]>,
    stagingDir: string,
    targetDir: string,
  ): FomodComponent[] {
    const components: FomodComponent[] = [];

    for (const step of config.steps) {
      const stepSelections = selections[step.id] || selections[step.name] || [];
      for (const group of step.groups) {
        for (const plugin of group.plugins) {
          if (!plugin.files || plugin.files.length === 0) continue;
          const files: string[] = [];
          const sourceFiles: { source: string; destination: string }[] = [];
          for (const f of plugin.files) {
            const effectiveDest = f.destination || f.source;
            sourceFiles.push({ source: f.source, destination: effectiveDest });
            const srcPath = path.join(stagingDir, f.source);
            if (fs.existsSync(srcPath) && fs.statSync(srcPath).isDirectory()) {
              this.walkDir(srcPath, (rel) => {
                files.push(path.join(effectiveDest, rel));
              });
            } else {
              files.push(effectiveDest);
            }
          }
          components.push({
            name: plugin.name,
            description: plugin.description || "",
            enabled: stepSelections.includes(plugin.name),
            files,
            sourceFiles,
          });
        }
      }
    }

    return components;
  }

  private static walkDir(dir: string, callback: (relPath: string) => void, base: string = dir): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(base, full);
      if (entry.isDirectory()) {
        this.walkDir(full, callback, base);
      } else {
        callback(rel);
      }
    }
  }

  /** Remove files and directories not part of the resolved FOMOD selection.
   *  Only `fomod/` directory and paths in `copiedFiles` are kept. */
  static cleanupNonSelected(
    stagingDir: string,
    copiedFiles: string[],
  ): number {
    const keep = new Set<string>();
    keep.add("fomod");

    for (const filePath of copiedFiles) {
      const relPath = path.relative(stagingDir, filePath);
      const parts = relPath.split(/[/\\]/);
      for (let i = 0; i < parts.length; i++) {
        keep.add(parts.slice(0, i + 1).join("/"));
      }
    }

    let removed = 0;
    const entries = fs.readdirSync(stagingDir, { withFileTypes: true });
    for (const entry of entries) {
      if (keep.has(entry.name)) continue;
      const fullPath = path.join(stagingDir, entry.name);
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
        removed++;
      } catch { /* skip */ }
    }

    return removed;
  }

  /**
   * Retroactively capture FOMOD component data for an already-installed mod.
   * Parses the FOMOD config, then matches existing files in stagingDir to plugins.
   * Returns the component map (or empty array if no FOMOD found).
   */
  static captureComponentsRetroactive(stagingDir: string): FomodComponent[] {
    const config = this.parse(stagingDir);
    if (!config) return [];

    // Map to deduplicate: same component name from different steps (e.g. Default vs CBBE) merges files
    const map = new Map<string, FomodComponent>();

    for (const step of config.steps) {
      for (const group of step.groups) {
        for (const plugin of group.plugins) {
          if (!plugin.files || plugin.files.length === 0) continue;

          const files: string[] = [];
          const sourceFiles: { source: string; destination: string }[] = [];
          let existsCount = 0;

          for (const f of plugin.files) {
            const srcPath = path.join(stagingDir, f.source);
            const effectiveDest = f.destination || f.source;
            sourceFiles.push({ source: f.source, destination: effectiveDest });

            if (fs.existsSync(srcPath)) {
              existsCount++;
              if (fs.statSync(srcPath).isDirectory()) {
                this.walkDir(srcPath, (rel) => {
                  files.push(path.join(effectiveDest, rel));
                });
              } else {
                files.push(effectiveDest);
              }
            }
          }

          if (existsCount > 0) {
            const existing = map.get(plugin.name);
            if (existing) {
              // Merge: add files that aren't already tracked
              const existingFileSet = new Set(existing.files);
              for (const f of files) {
                if (!existingFileSet.has(f)) existing.files.push(f);
              }
              const existingSourceSet = new Set(existing.sourceFiles.map(s => s.source));
              for (const sf of sourceFiles) {
                if (!existingSourceSet.has(sf.source)) existing.sourceFiles.push(sf);
              }
            } else {
              map.set(plugin.name, {
                name: plugin.name,
                description: plugin.description || "",
                enabled: true,
                files,
                sourceFiles,
              });
            }
          }
        }
      }
    }

    return Array.from(map.values());
  }

  private static copyRecursive(src: string, dest: string, copied: string[]): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyRecursive(s, d, copied);
      } else {
        if (fs.existsSync(d)) fs.unlinkSync(d);
        fs.copyFileSync(s, d);
        copied.push(d);
      }
    }
  }
}

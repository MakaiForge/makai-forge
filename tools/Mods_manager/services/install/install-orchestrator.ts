/**
 * Install Orchestrator — Orquestra instalação completa de mods.
 *
 * Fluxo: reading_archive → extracting → verifying → resolving → copying → saving → ready
 *
 * Cada stage tem seu próprio timeout e tratamento de erros.
 * Suporta abort via AbortController.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ModStorageService } from "@main/services";
import { getStagingDir } from "@games/_shared/filemap";
import { expandHome } from "../path-utils";
import { readArchiveInfo } from "./archive-reader";
import { extractWithProgress } from "./archive-extractor";
import { verifyExtractedFiles } from "./integrity-checker";
import { resolveInstallPlan } from "./install-resolver";
import { copyFiles } from "./file-copier";
import { detectModType, inventoryMod } from "../mod-deploy/inventory";
import { parseFomodXml, resolveFomodFiles } from "../fomod/fomod-parser";
import { mkInvKey, mkMlKey } from "../storage-keys";
import type {
  InstallStage,
  InstallProgress,
  InstallResult,
  InstallConfig,
  ArchiveInfo,
  ExtractedFile,
  InstallPlan,
  CopyResult,
} from "../../types/install.types";
import type { ModlistEntry } from "../../types/install.types";

type ProgressCallback = (progress: InstallProgress) => void;
type StageCallback = (from: InstallStage, to: InstallStage) => void;

export class InstallOrchestrator {
  private currentStage: InstallStage = "idle";
  private progress: InstallProgress;
  private onProgress: ProgressCallback;
  private onStageChange: StageCallback;
  private abortController: AbortController | null = null;
  private targetDir: string = "";

  constructor(
    onProgress: ProgressCallback,
    onStageChange: StageCallback,
  ) {
    this.onProgress = onProgress;
    this.onStageChange = onStageChange;
    this.progress = {
      stage: "idle",
      percent: 0,
      message: "",
      modName: "",
      filesProcessed: 0,
      filesTotal: 0,
      bytesProcessed: 0,
      bytesTotal: 0,
      startTime: 0,
      elapsedMs: 0,
    };
  }

  /**
   * Executa instalação completa de um mod.
   *
   * @param archivePath Caminho do archive
   * @returns InstallResult com resultado da instalação
   */
  async install(archivePath: string, config: InstallConfig): Promise<InstallResult> {
    this.abortController = new AbortController();
    this.progress.startTime = Date.now();
    this.progress.modName = this.extractModName(archivePath);

    try {
      // ── Stage 1: Read Archive ──
      await this.transitionTo("reading_archive");
      const archiveInfo = await readArchiveInfo(archivePath);
      this.progress.archiveInfo = archiveInfo;
      this.progress.filesTotal = archiveInfo.totalFiles;
      this.progress.bytesTotal = archiveInfo.totalSize;
      this.updateProgress(5, `${archiveInfo.totalFiles} arquivos, ${this.formatSize(archiveInfo.totalSize)}`);

      // ── Stage 2: Extract ──
      await this.transitionTo("extracting");
      const stagingDir = this.getStagingDir(config);
      this.targetDir = path.join(stagingDir, this.progress.modName);
      const rawExtractedFiles = await extractWithProgress(
        archivePath,
        this.targetDir,
        archiveInfo,
        config.password,
        (filesProcessed, filesTotal, bytesProcessed, _bytesTotal, currentFile) => {
          const percent = Math.round((filesProcessed / filesTotal) * 60) + 5; // 5-65%
          this.progress.filesProcessed = filesProcessed;
          this.progress.bytesProcessed = bytesProcessed;
          this.progress.currentFile = currentFile;
          this.updateProgress(percent, `Extraindo... (${filesProcessed}/${filesTotal})`);
        },
        this.abortController.signal,
      );

      // Detect single-nested folder pattern (e.g. ModName/Fomod/, ModName/Data/)
      // and adjust targetDir so all downstream logic sees the correct root.
      const resolved = this.resolveNestedRoot(this.targetDir, rawExtractedFiles);
      this.targetDir = resolved.rootDir;
      const extractedFiles = resolved.extractedFiles;
      this.progress.extractedFiles = extractedFiles;

      // ── Stage 3: Verify ──
      if (config.verifyAfterExtract) {
        await this.transitionTo("verifying");
        this.updateProgress(65, "Verificando integridade...");
        const verification = verifyExtractedFiles(extractedFiles, archiveInfo.entries);
        if (!verification.allValid) {
          const errorFiles = verification.errors.map(e => e.file).join(", ");
          throw new Error(`Verificação falhou: ${verification.filesInvalid} arquivos inválidos (${errorFiles})`);
        }
        this.updateProgress(75, `${verification.filesValid} arquivos verificados`);
      }

      // ── Stage 4: Analyze + Resolve ──
      await this.transitionTo("analyzing");
      this.updateProgress(75, "Analisando estrutura...");
      const modType = detectModType(this.targetDir);
      const inventory = inventoryMod(this.targetDir, this.progress.modName);

      // Verificar FOMOD
      let fomodConfig: ReturnType<typeof parseFomodXml> = null;
      const fomodPaths = ["fomod/ModuleConfig.xml", "Fomod/ModuleConfig.xml", "FOMOD/ModuleConfig.xml"];
      for (const fomodPath of fomodPaths) {
        const fullPath = path.join(this.targetDir, fomodPath);
        if (fs.existsSync(fullPath)) {
          fomodConfig = parseFomodXml(fullPath);
          if (fomodConfig) {
            this.updateProgress(76, `FOMOD detectado: ${fomodConfig.name}`);
            break;
          }
        }
      }

      // Se tem FOMOD com required files, resolver automaticamente
      let fomodFiles: Array<{ source: string; destination: string }> = [];
      if (fomodConfig?.required_files && fomodConfig.required_files.length > 0) {
        fomodFiles = resolveFomodFiles(fomodConfig, {});
        this.updateProgress(77, `FOMOD: ${fomodFiles.length} arquivos obrigatórios`);
      }

      // Resolver destino de cada arquivo
      this.updateProgress(78, "Resolvendo destinos...");
      const installPlan = resolveInstallPlan(
        this.targetDir,
        config.gameId,
        this.progress.modName,
        config.getStripPrefixes ?? (() => []),
        config.getDeployTarget ?? ((gp: string) => gp),
        config.getCustomRoutingRules,
        config.getPluginExtensions,
        config.getRequiredFolders,
        config.getFlattenExtensions,
      );

      // Se tem arquivos FOMOD, adicionar ao plano (se não já presentes)
      if (fomodFiles.length > 0) {
        for (const fomodFile of fomodFiles) {
          const existing = installPlan.filesToInstall.find(f => f.source === fomodFile.source);
          if (!existing) {
            installPlan.filesToInstall.push({
              source: fomodFile.source,
              destination: fomodFile.destination || fomodFile.source,
              action: "copy",
              reason: "FOMOD required file",
            });
          }
        }
      }

      // ── Stage 5: Copy ──
      await this.transitionTo("copying");
      this.updateProgress(80, `Copiando ${installPlan.filesToInstall.length} arquivos...`);

      const gamePath = config.gamePath ? expandHome(config.gamePath) : "";
      const targetDir = config.getDeployTarget?.(gamePath) ?? gamePath;
      const copyResult = await copyFiles(
        installPlan.filesToInstall,
        this.targetDir,
        targetDir,
        (current, total, currentFile) => {
          const percent = Math.round((current / total) * 15) + 80; // 80-95%
          this.updateProgress(percent, `Copiando ${current}/${total}: ${path.basename(currentFile)}`);
        },
      );

      if (!copyResult.success) {
        console.warn("[ORCHESTRATOR] Some files failed to copy:", copyResult.errors);
      }

      // ── Stage 6: Save ──
      await this.transitionTo("saving");
      this.updateProgress(95, "Salvando no modlist...");

      // Salvar inventário
      const inventoryKey = mkInvKey(config.gameId, this.progress.modName);
      ModStorageService.put(inventoryKey, { ...inventory });

      // Atualizar modlist
      const modlistKey = mkMlKey(config.gameId, config.profile);
      const existing: ModlistEntry[] = ModStorageService.get(modlistKey) || [];
      const existingIdx = existing.findIndex((m) => m.name === this.progress.modName);

      const newMod: ModlistEntry = {
        name: this.progress.modName,
        enabled: true,
        locked: false,
        version: "",
        priority: existingIdx >= 0 ? existing[existingIdx].priority : existing.length,
        isSeparator: false,
        stagingDir: this.targetDir,
        plugins: inventory.pluginFiles,
        hasFomod: modType.hasFomod,
        hasSkse: modType.hasSkse,
      };

      if (existingIdx >= 0) {
        existing[existingIdx] = newMod;
      } else {
        existing.push(newMod);
      }
      ModStorageService.put(modlistKey, existing);

      // ── Stage 7: Ready ──
      await this.transitionTo("ready");
      this.updateProgress(100, "Instalação concluída");

      return this.buildResult(archiveInfo, extractedFiles, modType, inventory, installPlan, copyResult);

    } catch (error) {
      console.error("[ORCHESTRATOR] install failed:", error);
      await this.transitionTo("error");
      this.progress.message = String(error);
      this.onProgress({ ...this.progress });

      return {
        success: false,
        modName: this.progress.modName,
        stagingDir: this.targetDir || config.stagingDir,
        archiveInfo: this.progress.archiveInfo || {
          path: archivePath,
          name: path.basename(archivePath),
          totalSize: 0,
          totalFiles: 0,
          compressedSize: 0,
          format: "zip",
          isPasswordProtected: false,
          entries: [],
        },
        extractedFiles: this.progress.extractedFiles || [],
        verified: false,
        plugins: [],
        hasFomod: false,
        hasSkse: false,
        category: "unknown",
        error: String(error),
        durationMs: Date.now() - this.progress.startTime,
      };
    }
  }

  /**
   * Detecta quando um archive tem uma única pasta raiz (ex: ModName/Data/, ModName/Fomod/)
   * e ajusta o targetDir para apontar para ela, corrigindo caminhos relativos.
   */
  private resolveNestedRoot(
    rootDir: string,
    extractedFiles: ExtractedFile[],
  ): { rootDir: string; extractedFiles: ExtractedFile[] } {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(rootDir, { withFileTypes: true });
    } catch {
      return { rootDir, extractedFiles };
    }

    const dirs = entries.filter(e => e.isDirectory());
    const files = entries.filter(e => e.isFile());

    // Se tem múltiplos diretórios ou arquivos na raiz, não é nested
    if (dirs.length !== 1 || files.length > 0) return { rootDir, extractedFiles };

    const innerDir = path.join(rootDir, dirs[0].name);
    // Só considera nested se o diretório interno tiver conteúdo de mod
    try {
      const innerEntries = fs.readdirSync(innerDir);
      const hasModContent = innerEntries.some(name =>
        ["fomod", "Fomod", "FOMOD", "Data", "data", "scripts", "meshes", "textures", "SKSE", "skse"]
          .includes(name) ||
        name.endsWith(".esp") || name.endsWith(".esm") || name.endsWith(".esl")
      );
      if (!hasModContent) return { rootDir, extractedFiles };
    } catch {
      return { rootDir, extractedFiles };
    }

    const prefix = dirs[0].name + "/";
    const adjusted = extractedFiles.map(f => ({
      ...f,
      relativePath: f.relativePath.startsWith(prefix)
        ? f.relativePath.slice(prefix.length)
        : f.relativePath,
    }));

    return { rootDir: innerDir, extractedFiles: adjusted };
  }

  /**
   * Cancela instalação em andamento.
   */
  abort(): void {
    this.abortController?.abort();
  }

  /**
   * Retorna o stage atual.
   */
  getCurrentStage(): InstallStage {
    return this.currentStage;
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  private async transitionTo(stage: InstallStage): Promise<void> {
    const from = this.currentStage;
    this.currentStage = stage;
    this.progress.stage = stage;
    this.onStageChange(from, stage);
  }

  private updateProgress(percent: number, message: string): void {
    this.progress.percent = Math.min(100, Math.max(0, percent));
    this.progress.message = message;
    this.progress.elapsedMs = Date.now() - this.progress.startTime;
    this.onProgress({ ...this.progress });
  }

  private getStagingDir(config: InstallConfig): string {
    let stagingDir = config.stagingDir;
    if (stagingDir) {
      if (stagingDir.startsWith("~")) stagingDir = stagingDir.replace("~", os.homedir());
      fs.mkdirSync(stagingDir, { recursive: true });
      return stagingDir;
    }
    const defaultDir = getStagingDir(config.gameId);
    fs.mkdirSync(defaultDir, { recursive: true });
    return defaultDir;
  }

  private extractModName(archivePath: string): string {
    return path.basename(archivePath)
      .replace(/\.(zip|7z|rar|fomod|tar\.gz)$/i, "")
      .trim();
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  private buildResult(
    archiveInfo: ArchiveInfo,
    extractedFiles: ExtractedFile[],
    modType: ReturnType<typeof detectModType>,
    inventory: ReturnType<typeof inventoryMod>,
    installPlan?: InstallPlan,
    copyResult?: CopyResult,
  ): InstallResult {
    return {
      success: true,
      modName: this.progress.modName,
      stagingDir: this.targetDir,
      archiveInfo,
      extractedFiles,
      verified: true,
      plugins: inventory.pluginFiles,
      hasFomod: modType.hasFomod,
      hasSkse: modType.hasSkse,
      category: "unknown",
      durationMs: Date.now() - this.progress.startTime,
      installPlan,
      copyResult,
    };
  }
}

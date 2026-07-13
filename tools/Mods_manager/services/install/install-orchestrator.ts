/**
 * Install Orchestrator — Orquestra instalação completa de mods.
 *
 * Fluxo: reading_archive → extracting → verifying → analyzing → saving → ready
 *
 * Cada stage tem seu próprio timeout e tratamento de erros.
 * Suporta abort via AbortController.
 * Lê game:${gameId}:config e consulta GameModule pra saber qual jogo é.
 * NOTA: Arquivos ficam no staging — o deploy engine cria symlinks para o jogo.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ModStorageService } from "@main/services";
import { getGameModule } from "@games/registry";
import { getStagingDir } from "@games/_shared/filemap";
import { readArchiveInfo } from "./archive-reader";
import { extractWithProgress } from "./archive-extractor";
import { verifyExtractedFiles } from "./integrity-checker";
import { detectModType, inventoryMod } from "../mod-deploy/inventory";
import { parseFomodXml, resolveFomodFiles } from "../fomod/fomod-parser";
import { hasBain } from "./strip-prefix";
import { writeModMeta } from "./meta-writer";
import { checkOverwrite } from "./overwrite-check";
import { deploy } from "../mod-deploy/core";
import { mkInvKey, mkMlKey } from "../storage-keys";
import type {
  InstallStage,
  InstallProgress,
  InstallResult,
  InstallConfig,
  ArchiveInfo,
  ExtractedFile,
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

  async install(archivePath: string, config: InstallConfig): Promise<InstallResult> {
    this.abortController = new AbortController();
    this.progress.startTime = Date.now();
    this.progress.modName = this.extractModName(archivePath);

    // ── Ler config do jogo e GameModule ──
    const gameConfig = ModStorageService.get<any>(`game:${config.gameId}:config`);
    const gameModule = getGameModule(config.gameId, gameConfig?.gamePath || "");
    const gameName = gameModule.displayName || config.gameId;
    const pluginExts = gameModule?.getPluginExtensions?.() ?? [];

    try {
      // ── Pre-flight: Validate game path ──
      const gamePath = gameConfig?.gamePath ? (gameConfig.gamePath.startsWith("~") ? gameConfig.gamePath.replace("~", os.homedir()) : gameConfig.gamePath) : "";
      if (gamePath && !fs.existsSync(gamePath)) {
        this.updateProgress(0, `[${gameName}] Caminho do jogo não encontrado: ${gamePath}`);
        throw new Error(`Caminho do jogo não encontrado: ${gamePath}. Configure em "Configurar Jogo".`);
      }

      // ── Stage 1: Read Archive ──
      await this.transitionTo("reading_archive");
      const archiveInfo = await readArchiveInfo(archivePath);
      this.progress.archiveInfo = archiveInfo;
      this.progress.filesTotal = archiveInfo.totalFiles;
      this.progress.bytesTotal = archiveInfo.totalSize;
      this.updateProgress(5, `[${gameName}] ${archiveInfo.totalFiles} arquivos, ${this.formatSize(archiveInfo.totalSize)}`);

      // ── Stage 2: Extract ──
      await this.transitionTo("extracting");
      const stagingDir = this.getStagingDir(config);
      this.targetDir = path.join(stagingDir, this.progress.modName);

      // ── Overwrite check (antes de extrair) ──
      const overwriteInfo = checkOverwrite(config.gameId, config.profile, this.progress.modName, stagingDir);
      if (overwriteInfo.exists && !config.overwriteExisting) {
        await this.transitionTo("ready");
        return {
          success: false,
          modName: this.progress.modName,
          gameName,
          gameId: config.gameId,
          stagingDir: this.targetDir,
          archiveInfo,
          extractedFiles: [],
          verified: false,
          plugins: [],
          hasFomod: false,
          hasBain: false,
          hasSkse: false,
          category: "unknown",
          alreadyExists: true,
          error: `Mod "${this.progress.modName}" já existe no staging.`,
          durationMs: Date.now() - this.progress.startTime,
        };
      }

      if (overwriteInfo.exists && config.overwriteExisting) {
        this.updateProgress(10, "Removendo versão anterior...");
        try { fs.rmSync(this.targetDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }

      const rawExtractedFiles = await extractWithProgress(
        archivePath,
        this.targetDir,
        archiveInfo,
        config.password,
        (filesProcessed, filesTotal, bytesProcessed, _bytesTotal, currentFile) => {
          const percent = Math.round((filesProcessed / filesTotal) * 60) + 5;
          this.progress.filesProcessed = filesProcessed;
          this.progress.bytesProcessed = bytesProcessed;
          this.progress.currentFile = currentFile;
          this.updateProgress(percent, `Extraindo... (${filesProcessed}/${filesTotal})`);
        },
        this.abortController.signal,
      );

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
      this.updateProgress(75, `[${gameName}] Analisando estrutura...`);
      const modType = detectModType(this.targetDir, pluginExts);
      const inventory = inventoryMod(this.targetDir, this.progress.modName, pluginExts);

      // Detectar BAIN
      const bainDetected = hasBain(this.targetDir);

      // Log do jogo detectado
      const usesPlugins = gameModule?.shouldWritePluginsTxt?.() ?? false;
      const deployTarget = gameModule?.getDeployTarget?.(gameConfig?.gamePath || "") || "";

      this.updateProgress(78, `[${gameName}] Deploy: ${deployTarget || "game root"}, Plugins: ${usesPlugins ? pluginExts.join("/") : "nenhum"}`);

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

      let fomodFiles: Array<{ source: string; destination: string }> = [];
      if (fomodConfig?.required_files && fomodConfig.required_files.length > 0) {
        fomodFiles = resolveFomodFiles(fomodConfig, {});
        this.updateProgress(77, `FOMOD: ${fomodFiles.length} arquivos obrigatórios`);
      }

      // ── Stage 6: Save ──
      await this.transitionTo("saving");
      this.updateProgress(90, `[${gameName}] Salvando metadata...`);

      // Gravar meta.ini
      if (config.writeMetadata !== false) {
        writeModMeta({
          gameId: config.gameId,
          modName: this.progress.modName,
          modDir: this.targetDir,
          archivePath,
          hasFomod: modType.hasFomod,
          hasBain: bainDetected,
          plugins: inventory.pluginFiles,
        });
        this.updateProgress(92, "Meta.ini gravado");
      }

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

      // ── Stage 6b: Deploy (symlinks staging→jogo) ──
      let deployed = false;
      let deployLog: string[] = [];
      if (gamePath) {
        this.updateProgress(94, `[${gameName}] Implantando mods no jogo...`);
        try {
          const deployResult = await deploy(config.gameId, config.profile);
          deployed = deployResult.success;
          deployLog = deployResult.log || [];
          if (deployed) {
            this.updateProgress(96, `[${gameName}] Mods implantados (${deployLog.length} operações)`);
          } else {
            this.updateProgress(96, `[${gameName}] Deploy falhou: ${deployResult.log?.slice(-1)[0] || "erro"}`);
          }
        } catch (deployErr) {
          deployLog = [`Deploy error: ${String(deployErr).slice(0, 200)}`];
          this.updateProgress(96, `[${gameName}] Deploy ignorado: ${String(deployErr).slice(0, 100)}`);
        }
      } else {
        this.updateProgress(94, `[${gameName}] Sem gamePath — deploy ignorado`);
      }

      this.updateProgress(98, "Instalação concluída");

      // ── Stage 7: Ready ──
      await this.transitionTo("ready");
      this.updateProgress(100, "Instalação concluída");

      const result = this.buildResult(archiveInfo, extractedFiles, modType, inventory, bainDetected, gameName, config.gameId);
      result.deployed = deployed;
      result.deployLog = deployLog;
      return result;

    } catch (error) {
      console.error("[ORCHESTRATOR] install failed:", error);
      await this.transitionTo("error");
      this.progress.message = String(error);
      this.onProgress({ ...this.progress });

      return {
        success: false,
        modName: this.progress.modName,
        gameName,
        gameId: config.gameId,
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
        hasBain: false,
        hasSkse: false,
        category: "unknown",
        error: String(error),
        durationMs: Date.now() - this.progress.startTime,
      };
    }
  }

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

    if (dirs.length !== 1 || files.length > 0) return { rootDir, extractedFiles };

    const innerDir = path.join(rootDir, dirs[0].name);
    try {
      const innerEntries = fs.readdirSync(innerDir);
      const hasModContent = innerEntries.some(name =>
        ["fomod", "Fomod", "FOMOD", "Data", "data", "scripts", "meshes", "textures", "SKSE", "skse"]
          .includes(name) ||
        pluginExts.some(ext => name.toLowerCase().endsWith(ext))
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

  abort(): void {
    this.abortController?.abort();
  }

  getCurrentStage(): InstallStage {
    return this.currentStage;
  }

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
    // Prioridade: config do UI > config do jogo > default
    let stagingDir = config.stagingDir;
    if (!stagingDir) {
      const gameConfig = ModStorageService.get<any>(`game:${config.gameId}:config`);
      stagingDir = gameConfig?.stagingDir || "";
    }
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
    hasBain: boolean,
    gameName: string,
    gameId: string,
  ): InstallResult {
    return {
      success: true,
      modName: this.progress.modName,
      gameName,
      gameId,
      stagingDir: this.targetDir,
      archiveInfo,
      extractedFiles,
      verified: true,
      plugins: inventory.pluginFiles,
      hasFomod: modType.hasFomod,
      hasBain,
      hasSkse: modType.hasSkse,
      category: "unknown",
      durationMs: Date.now() - this.progress.startTime,
    };
  }
}

import { registerEvent } from "@main/events/register-event";
import { ModStorageService } from "@main/services";
import { getDeployFunction, getGameModule } from "@games/registry";
import { getStagingDir } from "@games/_shared/filemap";
import { applyWineDllOverrides } from "@games/_shared/prefix";
import { detectModType, inventoryMod } from "@mods/services/mod-deploy/inventory";
import { InstallOrchestrator } from "@mods/services/install/install-orchestrator";
import { mkInvKey, mkMlKey } from "@mods/services/storage-keys";
import type { InstallConfig, InstallProgress, InstallStage } from "@types/install.types";
import path from "node:path";
import fs from "node:fs";

registerEvent("checkModExists", async (_event, archivePath: string, gameId: string) => {
  const modName = path.basename(archivePath).replace(/\.(zip|7z|rar|fomod|tar\.gz)$/i, "");
  const config = ModStorageService.get<any>(`game:${gameId}:config`);
  const baseDir = config?.stagingDir || getStagingDir(gameId);
  const stagingPath = path.join(baseDir, modName);
  const exists = fs.existsSync(stagingPath);
  return { exists, modName, stagingPath };
});

registerEvent("deployMods", async (_event, gameId: string, profile: string) => {
  const config = ModStorageService.get<any>(`game:${gameId}:config`);
  if (!config) return { success: false, log: ["Game not configured"], filemap: {} };

  // Guard: validate gamePath is usable
  const gamePath = config.gamePath;
  if (!gamePath || typeof gamePath !== "string") {
    return { success: false, log: ["Game path not configured — set the game path first"], filemap: {} };
  }
  if (gamePath === "." || gamePath === "./" || gamePath === ".." || gamePath === "../") {
    return { success: false, log: [`Game path cannot be relative ("${gamePath}") — set the actual game directory`], filemap: {} };
  }
  if (gamePath.includes("~")) {
    return { success: false, log: [`Game path contains unexpanded "~" — use the full path (e.g. /home/cas/Games/...)`], filemap: {} };
  }
  if (!path.isAbsolute(gamePath)) {
    return { success: false, log: [`Game path must be absolute ("${gamePath}")`], filemap: {} };
  }
  if (!fs.existsSync(gamePath)) {
    return { success: false, log: [`Game path does not exist: ${gamePath}`], filemap: {} };
  }

  const stagingDir = config.stagingDir || getStagingDir(gameId);
  const modlistKey = mkMlKey(gameId, profile);
  const modlist: any[] = ModStorageService.get(modlistKey) || [];

  // Use the user-configured prefix — never resolve to Steam compatdata
  const resolvedPrefix = config.protonPrefix;

  // Resolve link mode: user config > game module default > "symlink"
  const mod = getGameModule(gameId, config.gamePath);
  const linkMode = config.deployMode || mod.defaultLinkMode || "symlink";

  const deployFn = getDeployFunction(gameId);
  const result = await deployFn(gameId, config.gamePath, stagingDir, modlist, profile, resolvedPrefix, linkMode);

  if (resolvedPrefix) {
    const overrides = mod.getWineDllOverrides?.();
    if (overrides && Object.keys(overrides).length > 0) {
      applyWineDllOverrides(resolvedPrefix, overrides);
    }
  }

  return result;
});

registerEvent("rescanStaging", async (_event, gameId: string, profileName: string) => {
  const config = ModStorageService.get<any>(`game:${gameId}:config`);
  const stagingDir = config?.stagingDir || getStagingDir(gameId);

  if (!fs.existsSync(stagingDir)) {
    return { newMods: [], deadMods: [], stagingDir };
  }

  const modlistKey = mkMlKey(gameId, profileName);
  const modlist: any[] = ModStorageService.get(modlistKey) || [];

  // ── Migrate mods from wrong stagingDir to correct one ──
  const defaultStaging = getStagingDir(gameId);
  let migrated = 0;
  for (const mod of modlist) {
    if (mod.isSeparator || !mod.stagingDir) continue;
    const isWrongDir = mod.stagingDir.startsWith(defaultStaging) && !mod.stagingDir.startsWith(stagingDir);
    if (!isWrongDir) continue;
    const modName = mod.name;
    const oldPath = mod.stagingDir;
    const newPath = path.join(stagingDir, modName);
    try {
      if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
        fs.mkdirSync(stagingDir, { recursive: true });
        fs.renameSync(oldPath, newPath);
        migrated++;
      }
      mod.stagingDir = fs.existsSync(newPath) ? newPath : mod.stagingDir;
    } catch { /* ignore move errors */ }
  }
  if (migrated > 0) {
    ModStorageService.put(modlistKey, modlist);
  }

  const trackedNames = new Set(modlist.map((m: any) => m.name));

  const stagingItems = fs.readdirSync(stagingDir, { withFileTypes: true });
  const newMods: any[] = [];
  const deadMods: any[] = [];

  for (const item of stagingItems) {
    if (!item.isDirectory() && !item.isSymbolicLink()) continue;
    if (item.name.startsWith(".")) continue;
    if (!trackedNames.has(item.name)) {
      const fullPath = path.join(stagingDir, item.name);
      const modType = detectModType(fullPath);
      const inventory = inventoryMod(fullPath, item.name);
      const inventoryKey = mkInvKey(gameId, item.name);
      ModStorageService.put(inventoryKey, inventory);

      newMods.push({
        name: item.name,
        enabled: true,
        version: "",
        priority: modlist.length + newMods.length,
        isSeparator: false,
        stagingDir: fullPath,
        plugins: modType.plugins,
        hasFomod: modType.hasFomod,
        hasSkse: modType.hasSkse,
      });
    }
  }

  const stagingNames = new Set(stagingItems.filter(i => i.isDirectory() || i.isSymbolicLink()).map(i => i.name));
  for (const mod of modlist) {
    if (mod.isSeparator) continue;
    if (!stagingNames.has(mod.name)) {
      deadMods.push(mod);
    }
  }

  if (newMods.length > 0) {
    modlist.push(...newMods);
    ModStorageService.put(modlistKey, modlist);
  }

  return { newMods, deadMods, stagingDir, totalTracked: trackedNames.size, totalStaging: stagingNames.size };
});

// ── Install Orchestrator ────────────────────────────────────────────────────

// Armazenar orchestrator ativo para suportar abort
let activeOrchestrator: InstallOrchestrator | null = null;

registerEvent("installModOrchestrated", async (event, archivePath: string, config: InstallConfig) => {
  console.log("[IPC] installModOrchestrated called", { archivePath, config });
  // Enviar progresso para o renderer
  const sendProgress = (progress: InstallProgress) => {
    try {
      event.sender.send("mod-install-progress", progress);
    } catch {
      /* webContents may be destroyed */
    }
  };

  const onStageChange = (_from: InstallStage, to: InstallStage) => {
    sendProgress({
      stage: to,
      percent: 0,
      message: "",
      modName: path.basename(archivePath).replace(/\.\w+$/, ""),
      filesProcessed: 0,
      filesTotal: 0,
      bytesProcessed: 0,
      bytesTotal: 0,
      startTime: Date.now(),
      elapsedMs: 0,
    });
  };

  const orchestrator = new InstallOrchestrator(sendProgress, onStageChange);
  activeOrchestrator = orchestrator;

  try {
    const result = await orchestrator.install(archivePath, config);
    return result;
  } finally {
    activeOrchestrator = null;
  }
});

registerEvent("abortInstall", async () => {
  if (activeOrchestrator) {
    activeOrchestrator.abort();
    activeOrchestrator = null;
    return { ok: true };
  }
  return { ok: false, error: "No active install" };
});

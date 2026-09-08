import { registerEvent } from "@main/events/register-event";
import { logOperation } from "../activity-logger";
import fs from "node:fs";
import p from "node:path";
import { app } from "electron";
import { getSteamLocation } from "@main/services/steam";
import { setSteamGameProton, getSteamGameProton } from "@main/services/steam-config-vdf";
import { ProtonfixService } from "@main/services/protonfix-service";
import { ProtonRecommendationService } from "@provision/proton_recommended/services/proton-recommendation";
import { getReleases, downloadTool } from "@proton/main/services/index";
import { findToolIdByForkName, PROTON_TOOLS } from "@proton/main/services/tools";
import { applyWineDllOverrides } from "@container/core/dll-overrides";
import { normalizePrefixPath } from "@container/core/validate";
import { clearSteamPrefixCore, createPrefix } from "@container/core/init";
import { getUmuBinaryPath } from "@provision/ForgePipeline/orchestrator/prefix-setup";
import { getGameModule, listKnownGames } from "@games/registry";
import { seedBethesdaRegistry } from "@container/core/bethesda-registry";

registerEvent("preparePrefix", async (_event, gameName: string) => {
  logOperation("preparePrefix", "started", { gameName });
  const result = await ProtonfixService.preparePrefix(gameName);
  logOperation("preparePrefix", result.success ? "success" : "error", { gameName });
  return result;
});

registerEvent("setupProtonEnvironment", async (_event, gameName: string, protonPath: string, prefixPathParam: string, clean?: boolean) => {
  const _startAll = Date.now();
  logOperation("setupProtonEnvironment", "started", {
    gameName,
    protonPath,
    prefixPathParam: prefixPathParam || "(empty)",
    clean: !!clean,
    caller: "ModManager",
  });

  const addLog = (msg: string) => { try { _event.sender.send("proton-setup-log", msg); } catch {} };

  const _finish = (success: boolean, extra: Record<string, unknown> = {}) => {
    logOperation("setupProtonEnvironment", success ? "success" : "error", {
      gameName,
      protonPath,
      prefixPathParam: prefixPathParam || "(empty)",
      duration_ms: Date.now() - _startAll,
      ...extra,
    });
    return { success, ...extra };
  };

  const gameNameLower = gameName.toLowerCase();
  const protonName = p.basename(protonPath);

  addLog(`▶ Configurando Proton para ${gameName}`);

  let appId: string | null = null;
  let foundGameName: string | null = null;
  let foundGamePath: string | null = null;
  let prefixPath: string;
  let steamPath: string | null = null;

  // Check if a custom prefix path was provided
  if (prefixPathParam && prefixPathParam.trim()) {
    prefixPath = normalizePrefixPath(prefixPathParam);
    addLog(`📁 Usando prefixo personalizado: ${prefixPath}`);
    steamPath = await getSteamLocation().catch(() => null);
  } else {
    // 1. Find Steam game (auto-detect)
    addLog("🔍 Analisando configurações Steam...");
    steamPath = await getSteamLocation().catch(() => null);
    if (!steamPath) {
      addLog("   ❌ Steam não encontrado");
      return _finish(false, { error: "Steam not found" });
    }
    addLog(`   Steam: ${steamPath}`);

    const libraryPaths: string[] = [steamPath];
    const libraryFoldersPath = p.join(steamPath, "steamapps", "libraryfolders.vdf");
    if (fs.existsSync(libraryFoldersPath)) {
      try {
        const vdfRaw = fs.readFileSync(libraryFoldersPath, "utf-8");
        const libMatch = vdfRaw.match(/"\d+"\s*\{[^}]*?"path"\s*"([^"]+)"/g);
        if (libMatch) {
          for (const entry of libMatch) {
            const pathMatch = entry.match(/"path"\s*"([^"]+)"/);
            if (pathMatch && fs.existsSync(pathMatch[1]) && !libraryPaths.includes(pathMatch[1])) {
              libraryPaths.push(pathMatch[1]);
            }
          }
        }
      } catch {}
    }

    const manifests: { appid: string; name: string; installdir?: string }[] = [];
    for (const libPath of libraryPaths) {
      const appsDir = p.join(libPath, "steamapps");
      if (!fs.existsSync(appsDir)) continue;
      let files: string[];
      try { files = fs.readdirSync(appsDir); } catch { continue; }
      for (const file of files) {
        const m = file.match(/^appmanifest_(\d+)\.acf$/i);
        if (!m) continue;
        try {
          const acfContent = fs.readFileSync(p.join(appsDir, file), "utf-8");
          const nameMatch = acfContent.match(/"name"\s*"([^"]+)"/);
          const installMatch = acfContent.match(/"installdir"\s*"([^"]+)"/);
          if (nameMatch) {
            const entry: { appid: string; name: string; installdir?: string } = { appid: m[1], name: nameMatch[1] };
            if (installMatch) {
              entry.installdir = installMatch[1];
            }
            manifests.push(entry);
            if (nameMatch[1].toLowerCase() === gameNameLower) {
              appId = m[1];
              foundGameName = nameMatch[1];
              foundGamePath = installMatch ? p.join(libPath, "steamapps", "common", installMatch[1]) : null;
              break;
            }
          }
        } catch {}
      }
      if (appId) break;
    }

    if (!appId) {
      for (const manifest of manifests) {
        if (manifest.name.toLowerCase().includes(gameNameLower)) {
          appId = manifest.appid;
          foundGameName = manifest.name;
          foundGamePath = (() => {
            for (const libPath of libraryPaths) {
              const candidate = p.join(libPath, "steamapps", "common", manifest.installdir || "");
              if (fs.existsSync(candidate)) return candidate;
            }
            return null;
          })();
          break;
        }
      }
    }

    if (appId) {
      addLog(`   ✅ Jogo "${foundGameName}" encontrado!`);
      addLog(`   ✅ Steam App ID: ${appId}`);
    } else {
      addLog("   ⚠ Jogo não encontrado na biblioteca Steam");
    }

    // 2. Clear the old Steam compatdata prefix
    addLog("🧹 Removendo prefixo antigo...");
    let compatDataPath: string | null = null;
    if (appId) {
      compatDataPath = await clearSteamPrefixCore(appId);
    }
    if (!compatDataPath) {
      addLog("   ⚠ Não foi possível localizar compatdata do jogo");
    } else {
      addLog(`   ✅ Prefixo antigo removido em: ${compatDataPath}`);
    }

    // 5. Resolve prefix path (Steam compatdata)
    prefixPath = compatDataPath
      ? p.join(compatDataPath, "pfx")
      : p.join(steamPath, "steamapps", "compatdata", appId || "unknown", "pfx");
  }

  // 3. Verify Proton
  addLog("🔧 Verificando Proton selecionado...");
  const protonBin = p.join(protonPath, "proton");
  if (!fs.existsSync(protonBin)) {
    addLog(`   ❌ Proton não encontrado em: ${protonBin}`);
    addLog("   💡 Use a aba Proton Tools para baixar");
    return _finish(false, { error: "Proton not found" });
  }
  addLog(`   ✅ ${protonName} encontrado`);
  addLog(`   Path: ${protonPath}`);

  // 4. Set Proton in Steam config.vdf (only for Steam games)
  if (appId && steamPath) {
    addLog("⚙ Atualizando config Steam...");
    try {
      const wrote = await setSteamGameProton(appId, protonName);
      if (wrote) {
        addLog(`   ✅ Proton "${protonName}" configurado no Steam`);
      } else {
        addLog("   ⚠ Falha ao escrever config.vdf");
      }
    } catch (err) {
      addLog(`   ⚠ Erro ao atualizar Steam: ${String(err).slice(0, 100)}`);
    }
  }

  addLog(`📁 Prefixo: ${prefixPath}`);

  // 6. Initialize Wine prefix
  addLog("");
  addLog("⚙ Inicializando Wine prefix...");
  addLog(`   Proton: ${protonName}`);
  addLog("   Executando wineboot -u. Aguarde...");

  if (!fs.existsSync(prefixPath)) {
    fs.mkdirSync(prefixPath, { recursive: true });
  }

  const umuBinary = getUmuBinaryPath();
  const useUmu = fs.existsSync(umuBinary);

  const winebootResult = await createPrefix({
    protonPath,
    prefixPath,
    useUmu,
    umuBinary,
    gameId: appId ? `umu-${appId}` : undefined,
    onProgress: (msg) => { if (msg.trim()) addLog(`   ${msg}`); },
    timeout: 120000,
  });

  if (!winebootResult.success) {
    addLog("");
    if (winebootResult.errorType === "default_pfx") {
      addLog("💡 default_pfx corrompido. Tentando reparo automático...");

      try {
        let toolId = findToolIdByForkName({ name: protonName, fork: "" });
        if (!toolId) {
          const nameClean = protonName.toLowerCase().replace(/[^a-z0-9]/g, "");
          let bestMatch: { id: string; len: number } | null = null;
          for (const tool of PROTON_TOOLS) {
            const fmtClean = tool.directoryNameFormat
              .replace("$version", "").toLowerCase().replace(/[^a-z0-9]/g, "");
            if (nameClean.startsWith(fmtClean) || fmtClean.startsWith(nameClean)) {
              if (!bestMatch || tool.directoryNameFormat.length > bestMatch.len) {
                bestMatch = { id: tool.id, len: tool.directoryNameFormat.length };
              }
            }
          }
          toolId = bestMatch?.id || undefined;
        }

        if (toolId) {
          addLog(`   Tool ID: ${toolId}`);
          const releases = await getReleases(toolId!);
          if (releases && releases.length > 0) {
            const release = releases.find((r: any) => {
              const tagNorm = r.tag_name.toLowerCase().replace(/[^a-z0-9]/g, "");
              const nameNorm = protonName.toLowerCase().replace(/[^a-z0-9]/g, "");
              return tagNorm === nameNorm || tagNorm.includes(nameNorm) || nameNorm.includes(tagNorm);
            }) || releases[0];

            if (release) {
              addLog(`   Release: ${release.tag_name}`);
              addLog("🗑 Removendo instalação corrompida...");
              try { fs.rmSync(protonPath, { recursive: true, force: true }); } catch {}
              addLog(`📥 Baixando ${release.tag_name}...`);
              const newPath = await downloadTool(
                { toolId, release, onProgress: (_percent: number, _speed: string) => {} },
              );
              if (newPath && fs.existsSync(p.join(newPath, "proton"))) {
                addLog(`   ✅ ${release.tag_name} instalado!`);
                addLog("   Clique em CONFIGURAR novamente para usar o novo Proton.");
                return _finish(true, { needsRestart: true, newProtonPath: newPath });
              }
            }
          }
        }
        addLog("   ❌ Não foi possível reparar automaticamente");
      } catch (err) {
        addLog(`   ❌ Erro no reparo: ${String(err).slice(0, 200)}`);
      }
    } else {
      addLog("❌ FALHA NA CONFIGURAÇÃO — Erro ao criar prefixo");
    }
    return _finish(false, { error: "Prefix creation failed", winebootError: winebootResult.error });
  }

  addLog("   ✅ Prefixo pronto");

  // 7. Apply game-specific DLL overrides from game module
  addLog("");
  addLog("📦 Aplicando configurações específicas do jogo...");
  try {
    let gameModule: import("@games/_shared/types").GameModule | null = null;
    if (appId) {
      for (const entry of listKnownGames()) {
        if (entry.steamAppId === appId) {
          gameModule = getGameModule(entry.gameId);
          break;
        }
      }
    }

    let appliedDllOverrides = false;
    if (gameModule?.getWineDllOverrides) {
      const overrides = gameModule.getWineDllOverrides();
      if (overrides && Object.keys(overrides).length > 0) {
        addLog(`   DLL overrides: ${Object.keys(overrides).join(", ")}`);
        applyWineDllOverrides(prefixPath, overrides);
        addLog("   ✅ DLL overrides aplicados");
        appliedDllOverrides = true;
      }
    }

    // Fallback: apply DLL overrides from game-dlls.json catalog
    if (!appliedDllOverrides) {
      try {
        let catalogPath = p.join(app.getAppPath(), "app", "Catalogo", "GameMod", "data", "game-dlls.json");
        if (!fs.existsSync(catalogPath)) {
          const devPath = p.join(process.cwd(), "app", "Catalogo", "GameMod", "data", "game-dlls.json");
          if (fs.existsSync(devPath)) catalogPath = devPath;
        }
        if (fs.existsSync(catalogPath)) {
          const raw = fs.readFileSync(catalogPath, "utf-8");
          const catalog = JSON.parse(raw);
          const slug = gameName.toLowerCase().replace(/[\s:/\\]+/g, "-").replace(/[^a-z0-9-]/g, "");
          const catalogEntry = catalog.games?.find(
            (g: any) => g.gameId === slug || g.gameId === gameName || g.name?.toLowerCase() === gameNameLower
          );
          if (catalogEntry) {
            const overrides: Record<string, string> = { ...catalogEntry.wineDllOverrides };
            if (catalogEntry.wineDllOverridesRange) {
              const ranges = catalogEntry.wineDllOverridesRange as Record<
                string,
                { start: number; end: number; mode: string }
              >;
              for (const [prefix2, range] of Object.entries(ranges)) {
                for (let i = range.start; i <= range.end; i++) {
                  overrides[`${prefix2}${i}`] = range.mode;
                }
              }
            }
            if (Object.keys(overrides).length > 0) {
              addLog(`   DLL overrides (catálogo): ${Object.keys(overrides).join(", ")}`);
              applyWineDllOverrides(prefixPath, overrides);
              addLog("   ✅ DLL overrides aplicados via catálogo");
              appliedDllOverrides = true;
            }
          }
        }
      } catch (e) {
        addLog(`   ⚠ Erro ao ler catálogo: ${String(e).slice(0, 100)}`);
      }
    }

    // 8. Install game-specific deps
    const deps: string[] = [];
    if (gameModule?.getAutoInstallDeps) {
      deps.push(...gameModule.getAutoInstallDeps());
    }
    if (gameModule?.getWinetricksComponents) {
      deps.push(...gameModule.getWinetricksComponents());
    }

    if (deps.length > 0) {
      addLog(`   Dependências: ${deps.join(", ")}`);
      try {
        const depResult = await ProtonRecommendationService.runMakaitricks(
          prefixPath, protonPath, deps,
        );
        if (depResult.installed?.length > 0) {
          addLog(`   ✅ Instalado: ${depResult.installed.join(", ")}`);
        }
        if (depResult.errors?.length > 0) {
          for (const err of depResult.errors) {
            addLog(`   ⚠ ${err}`);
          }
        }
      } catch (err) {
        addLog(`   ⚠ Erro ao instalar deps: ${String(err).slice(0, 200)}`);
      }
    } else {
      addLog("   ℹ Nenhuma dependência específica necessária");
    }

    // 9a. Seed Bethesda registry (game install path)
    if (gameModule?.bethesdaRegistryName && foundGamePath) {
      addLog(`   Registro Bethesda: ${gameModule.bethesdaRegistryName}`);
      try {
        const ok = seedBethesdaRegistry(prefixPath, foundGamePath, gameModule.bethesdaRegistryName);
        addLog(ok ? "   ✅ Caminho do jogo registrado no Wine" : "   ⚠ Falha ao registrar");
      } catch (err) {
        addLog(`   ⚠ Erro ao registrar: ${String(err).slice(0, 100)}`);
      }
    }

    // 10. Fallback for games without specific config
    if (!gameModule) {
      addLog("   📋 Usando DLLs recomendadas (genérico)...");
      try {
        const dllResult = await ProtonRecommendationService.installGameDlls(
          appId || gameName, prefixPath, protonPath,
        );
        if (dllResult.installed?.length > 0) {
          addLog(`   ✅ DLLs instaladas: ${dllResult.installed.join(", ")}`);
        }
      } catch {}
    }
  } catch (err) {
    addLog(`   ⚠ Erro ao aplicar configs: ${String(err).slice(0, 200)}`);
  }

  // 10. Final verification
  addLog("");
  addLog("✓ Verificação final:");

  const pfxDriveC = p.join(prefixPath, "drive_c");
  if (fs.existsSync(pfxDriveC)) {
    addLog("   ✅ Estrutura do prefixo: OK");
  } else {
    addLog("   ⚠ Estrutura do prefixo pode estar incompleta");
  }

  if (appId) {
    try {
      const current = await getSteamGameProton(appId);
      if (current && current.name === protonName) {
        addLog("   ✅ Proton configurado no Steam: OK");
      } else if (current) {
        addLog(`   ⚠ Steam está com "${current.name}" ao invés de "${protonName}"`);
      }
    } catch {}
  }

  addLog("");
  addLog("═══════════════════════════════════════");
  addLog("  ✅ AMBIENTE PRONTO!");
  addLog(`     Jogo: ${gameName}`);
  addLog(`     Proton: ${protonName}`);
  addLog(`     Prefixo: ${prefixPath}`);
  addLog("═══════════════════════════════════════");

  return _finish(true, { appId, prefixPath, foundGameName });
});

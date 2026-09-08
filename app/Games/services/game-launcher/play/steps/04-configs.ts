import fs from "node:fs";
import path from "node:path";
import { MakaiRPC } from "@mods-manager/services/makai-rpc";
import { getGameModule, getGameInfo } from "@games/registry";
import { findPrefixUsername } from "@games/_shared/filemap";
import { applyWineDllOverrides, verifyDllOverrides } from "@container/core/dll-overrides";
import { verifyBethesdaRegistry } from "@container/core/bethesda-registry";
import { findAllSteamLibraries } from "@container/core/steam-paths";
import type { SendProgress } from "../types";

export interface ConfigsResult {
  ok: boolean
  dllOk: boolean
  registryOk: boolean
  skseOk: boolean
  errors: string[]
}

export async function applyGameConfigs(
  gameId: string,
  gamePath: string,
  prefixPath: string,
  protonPath: string,
  send: SendProgress,
  steamAppId?: string,
  libraryPath?: string,
): Promise<ConfigsResult> {
  const result: ConfigsResult = { ok: true, dllOk: true, registryOk: true, skseOk: true, errors: [] };
  const mod = getGameModule(gameId, gamePath);
  const info = getGameInfo(gameId);

  // ── DLL Overrides ──
  send("dll", "Verificando DLL Overrides...", "working");
  const overrides = mod.getWineDllOverrides?.();

  if (overrides && Object.keys(overrides).length > 0) {
    const dllList = Object.keys(overrides);

    // Apply
    applyWineDllOverrides(prefixPath, overrides);

    // Verify
    const verify = verifyDllOverrides(prefixPath, overrides);
    if (verify.ok) {
      send("dll", `${dllList.length} DLL overrides OK: ${dllList.join(", ")}`, "done");
    } else {
      result.dllOk = false;
      result.errors.push(`DLL overrides falhou: faltando ${verify.missing.join(", ")}`);
      send("dll", `FALHA DLL overrides: ${verify.missing.length} nao encontrados em ${verify.userRegPath}: ${verify.missing.join(", ")}`, "error");
    }
  } else {
    send("dll", "Nenhum DLL override necessario", "done");
  }

  // ── Auto Install Deps (via Python Makaitricks, fallback: winetricks) ──
  const deps = mod.getAutoInstallDeps?.();
  const makaitricksVerbs = mod.getWinetricksComponents?.();

  if ((deps && deps.length > 0) || (makaitricksVerbs && makaitricksVerbs.length > 0)) {
    const allVerbs = [...(deps || []), ...(makaitricksVerbs || [])];
    send("dll", `Instalando dependencias: ${allVerbs.join(", ")}...`, "working");
    try {
      await MakaiRPC.call("install_makaitricks", {
        prefix_path: prefixPath,
        proton_path: protonPath,
        verbs: allVerbs,
      });
      send("dll", `Dependencias instaladas: ${allVerbs.join(", ")}`, "done");
    } catch (err) {
      result.errors.push(`Dependencias: falha — ${String(err).slice(0, 80)}`);
      send("dll", `Falha ao instalar dependencias: ${String(err).slice(0, 100)}`, "done");
    }
  }

  // ── Bethesda Registry ──
  send("registry", "Verificando registro Bethesda...", "working");

  if (mod.seedRegistry) {
    const seedOk = mod.seedRegistry(prefixPath, gamePath, protonPath, steamAppId, libraryPath);

    // Verify registry content in system.reg
    // Each game's seedXxxRegistry() hardcodes the Bethesda registry name.
    // We must use the SAME name for verification — info?.id may not match.
    const BETHESDA_REG_NAMES: Record<string, string> = {
      skyrim: "Skyrim", "skyrim-se": "Skyrim Special Edition", "skyrim-vr": "Skyrim VR",
      fallout3: "Fallout3", falloutnv: "FalloutNV", fallout4: "Fallout4", "fallout4-vr": "Fallout4VR",
      oblivion: "Oblivion", morrowind: "Morrowind", starfield: "Starfield",
      enderal: "Enderal", "enderal-se": "Enderal Special Edition",
    };
    const regName = BETHESDA_REG_NAMES[gameId] || info?.gameId || gameId;
    const verifyReg = verifyBethesdaRegistry(prefixPath, regName, gamePath);

    if (seedOk && verifyReg) {
      result.registryOk = true;
      send("registry", "Registro Bethesda OK (verificado em system.reg)", "done");
    } else if (!seedOk) {
      result.registryOk = false;
      result.errors.push("Registro Bethesda: falha ao gravar via proton run reg add");
      send("registry", "FALHA Registro Bethesda: proton run reg add retornou erro", "error");
    } else {
      result.registryOk = false;
      result.errors.push(`Registro Bethesda: system.reg nao contem entrada para ${regName}`);
      send("registry", `FALHA Registro Bethesda: entrada nao encontrada em system.reg para ${regName}`, "error");
    }
  } else {
    send("registry", "Jogo nao-Bethesda, pulando registro", "done");
  }

  // ── DXVK config (prevents black screen on old D3D9 games) ──
  const dxvkPath = path.join(gamePath, "dxvk.conf");
  if (!fs.existsSync(dxvkPath)) {
    send("dxvk", "Gerando dxvk.conf...", "working");
    const dxvkContent = [
      "# Gerado pelo Makai-Forge",
      "d3d9.maxAvailableMemory = 4096",
      "d3d9.presentInterval = 1",
      "dxvk.enableGraphicsPipelineLibrary = False",
      "dxvk.numCompilerThreads = 2",
    ].join("\n");
    fs.writeFileSync(dxvkPath, dxvkContent, "utf-8");
    send("dxvk", "dxvk.conf criado (GPL desligado para D3D9 antigo)", "done");
  } else {
    send("dxvk", "dxvk.conf ja existe", "done");
  }

  // ── My Games (INI/saves directory for Bethesda games) ──
  const gameSubpath = mod.getMyGamesSubpath?.();
  if (gameSubpath) {
    const username = findPrefixUsername(prefixPath) || "steamuser";
    const myGamesTarget = path.join(
      prefixPath, "drive_c", "users", username, "Documents", "My Games", gameSubpath,
    );
    if (!fs.existsSync(myGamesTarget)) {
      send("registry", "Criando diretorio My Games no prefixo...", "working");
      fs.mkdirSync(myGamesTarget, { recursive: true });
      send("registry", `My Games\\${gameSubpath} criado em ${myGamesTarget}`, "done");

      // Try to copy INI files from Steam prefix if available
      const steamAppId = info?.steamAppId;
      if (steamAppId) {
        const steamInis = findSteamMyGamesInis(steamAppId, gameSubpath);
        if (steamInis) {
          for (const [name, srcPath] of Object.entries(steamInis)) {
            const dst = path.join(myGamesTarget, name);
            if (!fs.existsSync(dst)) {
              try {
                fs.copyFileSync(srcPath, dst);
                send("registry", `Copiado ${name} do prefixo Steam`, "done");
              } catch {}
            }
          }
        }
      }
    } else {
      send("registry", `My Games\\${gameSubpath} ja existe`, "done");
    }

    // ── Skyrim LE: borderless fix (bFull Screen=1 + DXVK → crash) ──
    if (gameId === "skyrim") {
      const prefsIni = path.join(myGamesTarget, "SkyrimPrefs.ini");
      if (fs.existsSync(prefsIni)) {
        let content = fs.readFileSync(prefsIni, "utf-8");
        let changed = false;
        if (content.includes("bFull Screen=1")) {
          content = content.replace("bFull Screen=1", "bFull Screen=0");
          changed = true;
        }
        if (!content.includes("bBorderless=")) {
          content = content.replace(/\[Display\]/, "[Display]\nbBorderless=1");
          changed = true;
        }
        if (changed) {
          fs.writeFileSync(prefsIni, content, "utf-8");
          send("ini", "SkyrimPrefs.ini: borderless ativado (previne crash com DXVK)", "done");
        }
      }
    }
  }

  result.ok = result.dllOk && result.registryOk && result.errors.length === 0;
  return result;
}

function findSteamMyGamesInis(
  steamAppId: string,
  gameSubpath: string,
): Record<string, string> | null {
  const libraries = findAllSteamLibraries();
  for (const lib of libraries) {
    const compatData = path.join(lib, "compatdata", steamAppId);
    if (!fs.existsSync(compatData)) continue;

    const myGamesDir = path.join(
      compatData, "pfx", "drive_c", "users", "steamuser", "Documents", "My Games", gameSubpath,
    );
    if (!fs.existsSync(myGamesDir)) continue;

    const inis: Record<string, string> = {};
    for (const f of fs.readdirSync(myGamesDir)) {
      if (f.endsWith(".ini")) {
        const fp = path.join(myGamesDir, f);
        if (fs.statSync(fp).isFile()) {
          inis[f] = fp;
        }
      }
    }
    return Object.keys(inis).length > 0 ? inis : null;
  }
  return null;
}



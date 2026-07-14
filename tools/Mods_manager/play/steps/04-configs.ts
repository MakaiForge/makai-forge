import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { getGameModule, getGameInfo } from "@games/registry";
import { findPrefixUsername } from "@games/_shared/filemap";
import { applyWineDllOverrides, verifyDllOverrides } from "@prefix/core/dll-overrides";
import { verifyBethesdaRegistry } from "@prefix/core/bethesda-registry";
import { findAllSteamLibraries } from "@prefix/core/steam-paths";
import { runPythonCommand } from "../python";
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

  if (deps && deps.length > 0) {
    send("dll", `Instalando dependencias: ${deps.join(", ")}...`, "working");
    const resultCmd = await runPythonCommand(
      "install-makaitricks",
      [prefixPath, protonPath, ...deps],
    );
    if (resultCmd.success) {
      send("dll", `Dependencias instaladas: ${deps.join(", ")}`, "done");
    } else if (isPythonUnavailable(resultCmd.stderr)) {
      // Fallback: try winetricks directly
      const fallbackOk = runWinetricksDirect(prefixPath, protonPath, deps, send);
      if (!fallbackOk) {
        result.errors.push(`Dependencias nao instaladas (Python e winetricks indisponiveis): ${deps.join(", ")}`);
      }
    } else {
      result.errors.push(`Dependencias: falha parcial — ${resultCmd.stderr.slice(0, 80)}`);
      send("dll", `Falha ao instalar dependencias: ${resultCmd.stderr.slice(0, 100)}`, "done");
    }
  }

  if (makaitricksVerbs && makaitricksVerbs.length > 0) {
    send("dll", `Instalando componentes wine: ${makaitricksVerbs.join(", ")}...`, "working");
    const resultCmd = await runPythonCommand(
      "install-makaitricks",
      [prefixPath, protonPath, ...makaitricksVerbs],
    );
    if (resultCmd.success) {
      send("dll", `Componentes wine instalados: ${makaitricksVerbs.join(", ")}`, "done");
    } else if (isPythonUnavailable(resultCmd.stderr)) {
      runWinetricksDirect(prefixPath, protonPath, makaitricksVerbs, send);
    } else {
      send("dll", `Falha ao instalar componentes: ${resultCmd.stderr.slice(0, 100)}`, "done");
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
    const regName = BETHESDA_REG_NAMES[gameId] || info?.id || gameId;
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

/** Check if Python/venv is unavailable (missing binary or CLI) */
function isPythonUnavailable(stderr: string): boolean {
  return stderr.includes("Python bin not found") ||
    stderr.includes("CLI not found") ||
    stderr.includes("ENOENT");
}

/**
 * Fallback: install deps via bundled Makaitricks directly (without Python wrapper).
 * Maps dep names to winetricks verbs and runs Makaitricks with the correct env.
 */
function getMakaitricksPath(): string {
  // 1. Bundled Makaitricks — derive path from this file's location
  //    04-configs.ts → play/steps/ → play/ → Mods_manager/ → tools/ → project root
  const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");
  const bundled = path.join(projectRoot, "data", "install-api", "Makaitricks");
  if (fs.existsSync(bundled)) return bundled;

  // 2. Electron packaged path
  try {
    const appPath = require("electron").app.getAppPath();
    const packaged = path.join(appPath, "data", "install-api", "Makaitricks");
    if (fs.existsSync(packaged)) return packaged;
  } catch {}

  // 3. Fallback: system winetricks
  for (const candidate of ["/usr/bin/winetricks", "/usr/local/bin/winetricks"]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function runWinetricksDirect(
  prefixPath: string,
  protonPath: string,
  deps: string[],
  send: SendProgress,
): boolean {
  const DEP_TO_VERB: Record<string, string> = {
    vcredist: "vcrun2022",
    d3dcompiler_47: "d3dcompiler_47",
    dxvk: "dxvk",
  };

  const verbs = deps.map(d => DEP_TO_VERB[d] || d).filter(Boolean);
  if (verbs.length === 0) return false;

  const winetricksPath = getMakaitricksPath();
  if (!winetricksPath) {
    send("dll", `⚠️ Makaitricks/winetricks nao encontrado — ${deps.join(", ")} nao instalados`, "done");
    return false;
  }

  try {
    const env = {
      ...process.env,
      WINEPREFIX: prefixPath,
      WINETRICKS_SUPERVISOR_NOCHOICE: "1",
      WINETRICKS_NO_INTERACTIVE: "1",
    };
    for (const verb of verbs) {
      execSync(`"${winetricksPath}" -q ${verb}`, {
        env,
        stdio: "pipe",
        timeout: 120000,
      });
    }
    send("dll", `Dependencias instaladas via Makaitricks: ${deps.join(", ")}`, "done");
    return true;
  } catch (err) {
    send("dll", `⚠️ Falha no Makaitricks fallback: ${String(err).slice(0, 80)}`, "done");
    return false;
  }
}

import fs from "node:fs";
import path from "node:path";
import { getGameModule, getGameInfo } from "@games/registry";
import { findPrefixUsername } from "@games/_shared/filemap";
import { applyWineDllOverrides } from "@prefix/core/dll-overrides";
import { findAllSteamLibraries } from "@prefix/core/steam-paths";
import { runPythonCommand } from "../python";
import type { SendProgress } from "../types";

export async function applyGameConfigs(
  gameId: string,
  gamePath: string,
  prefixPath: string,
  protonPath: string,
  send: SendProgress,
  steamAppId?: string,
  libraryPath?: string,
): Promise<void> {
  const mod = getGameModule(gameId, gamePath);
  const info = getGameInfo(gameId);

  // ── DLL Overrides ──
  send("dll", "📦 Verificando DLL Overrides...", "working");
  const overrides = mod.getWineDllOverrides?.();

  if (overrides && Object.keys(overrides).length > 0) {
    const dllList = Object.keys(overrides);
    applyWineDllOverrides(prefixPath, overrides);
    send("dll", `✅ ${dllList.length} DLL overrides aplicados: ${dllList.join(", ")}`, "done");
  } else {
    send("dll", "✅ Nenhum DLL override necessário", "done");
  }

  // ── Auto Install Deps (via Python Makaitricks) ──
  const deps = mod.getAutoInstallDeps?.();
  const makaitricksVerbs = mod.getWinetricksComponents?.();

  if (deps && deps.length > 0) {
    send("dll", `📥 Instalando dependências: ${deps.join(", ")}...`, "working");
    const result = await runPythonCommand(
      "install-makaitricks",
      [prefixPath, protonPath, ...deps],
    );
    if (result.success) {
      send("dll", `✅ Dependências instaladas: ${deps.join(", ")}`, "done");
    } else {
      send("dll", `⚠️ Falha ao instalar algumas dependências: ${result.stderr.slice(0, 100)}`, "done");
    }
  }

  if (makaitricksVerbs && makaitricksVerbs.length > 0) {
    send("dll", `📥 Instalando componentes wine: ${makaitricksVerbs.join(", ")}...`, "working");
    const result = await runPythonCommand(
      "install-makaitricks",
      [prefixPath, protonPath, ...makaitricksVerbs],
    );
    if (result.success) {
      send("dll", `✅ Componentes wine instalados: ${makaitricksVerbs.join(", ")}`, "done");
    } else {
      send("dll", `⚠️ Falha ao instalar alguns componentes: ${result.stderr.slice(0, 100)}`, "done");
    }
  }

  // ── Bethesda Registry ──
  send("registry", "🏛️ Verificando registro Bethesda...", "working");

  if (mod.seedRegistry) {
    const ok = mod.seedRegistry(prefixPath, gamePath, protonPath, steamAppId, libraryPath);
    send("registry",
      ok
        ? `✅ Registro Bethesda configurado via proton run reg add`
        : `⚠️ Falha ao configurar registro Bethesda`,
      "done",
    );
  } else {
    send("registry", "⏭️ Jogo não-Bethesda, pulando registro", "done");
  }

  // ── DXVK config (prevents black screen on old D3D9 games) ──
  const dxvkPath = path.join(gamePath, "dxvk.conf");
  if (!fs.existsSync(dxvkPath)) {
    send("dxvk", "🎮 Gerando dxvk.conf...", "working");
    const dxvkContent = [
      "# Gerado pelo Makai-Forge",
      "d3d9.maxAvailableMemory = 4096",
      "d3d9.presentInterval = 1",
      "dxvk.enableGraphicsPipelineLibrary = False",
      "dxvk.numCompilerThreads = 2",
    ].join("\n");
    fs.writeFileSync(dxvkPath, dxvkContent, "utf-8");
    send("dxvk", "✅ dxvk.conf criado (GPL desligado para D3D9 antigo)", "done");
  } else {
    send("dxvk", "✅ dxvk.conf já existe", "done");
  }

  // ── My Games (INI/saves directory for Bethesda games) ──
  const gameSubpath = mod.getMyGamesSubpath?.();
  if (gameSubpath) {
    const username = findPrefixUsername(prefixPath) || "steamuser";
    const myGamesTarget = path.join(
      prefixPath, "drive_c", "users", username, "Documents", "My Games", gameSubpath,
    );
    if (!fs.existsSync(myGamesTarget)) {
      send("registry", "📁 Criando diretório My Games no prefixo...", "working");
      fs.mkdirSync(myGamesTarget, { recursive: true });
      send("registry", `✅ My Games\\${gameSubpath} criado em ${myGamesTarget}`, "done");

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
                send("registry", `📄 Copiado ${name} do prefixo Steam`, "done");
              } catch {}
            }
          }
        }
      }
    } else {
      send("registry", `✅ My Games\\${gameSubpath} já existe`, "done");
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
          send("ini", "✅ SkyrimPrefs.ini: borderless ativado (previne crash com DXVK)", "done");
        }
      }
    }
  }
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

import fs from "node:fs";
import path from "node:path";
import { resolvePrefixDir, isValidPrefix, dllOverridesMatch } from "../prefix-validator";
import { gameDllCatalog } from "../game-dlls-service";
import { logger } from "@main/services";

export interface HealthReport {
  valid: boolean;
  prefixExists: boolean;
  prefixValid: boolean;
  dllOverridesOk: boolean;
  dllOverridesMissing: string[];
  seInstalled: boolean;
  seName: string;
  frameworks: { name: string; installed: boolean }[];
  depsInstalled: string[];
  depsMissing: string[];
  errors: string[];
}

export function checkPrefixHealth(gameId: string, gamePath: string, prefixPath: string): HealthReport {
  const report: HealthReport = {
    valid: true,
    prefixExists: false,
    prefixValid: false,
    dllOverridesOk: false,
    dllOverridesMissing: [],
    seInstalled: false,
    seName: "",
    frameworks: [],
    depsInstalled: [],
    depsMissing: [],
    errors: [],
  };

  const actualPfx = resolvePrefixDir(prefixPath);
  report.prefixExists = actualPfx !== null;
  report.prefixValid = actualPfx ? isValidPrefix(actualPfx) : false;

  if (!report.prefixValid) {
    report.valid = false;
    report.errors.push("Prefixo inválido ou não existe");
  }

  const gameInfo = gameDllCatalog.getGame(gameId);
  if (!gameInfo) {
    report.errors.push("Jogo não encontrado no catálogo de DLLs");
    return report;
  }

  if (gameInfo.wineDllOverrides && Object.keys(gameInfo.wineDllOverrides).length > 0) {
    const matches = dllOverridesMatch(prefixPath, gameInfo.wineDllOverrides);
    report.dllOverridesOk = matches;
    if (!matches) {
      report.dllOverridesMissing = Object.keys(gameInfo.wineDllOverrides);
      report.valid = false;
    }
  } else {
    report.dllOverridesOk = true;
  }

  if (gameInfo.scriptExtender) {
    const sePath = path.join(gamePath, gameInfo.scriptExtender.loaderExe);
    report.seInstalled = fs.existsSync(sePath);
    report.seName = gameInfo.scriptExtender.name;
    if (!report.seInstalled) {
      report.valid = false;
    }
  }

  if (gameInfo.frameworks) {
    report.frameworks = Object.entries(gameInfo.frameworks).map(([name, file]) => ({
      name,
      installed: fs.existsSync(path.join(gamePath, file)),
    }));
    const missing = report.frameworks.filter((f) => !f.installed);
    if (missing.length > 0) report.valid = false;
  }

  if (gameInfo.autoInstallDeps?.length) {
    const sys32 = actualPfx ? path.join(actualPfx, "drive_c", "windows", "system32") : "";
    for (const dep of gameInfo.autoInstallDeps) {
      const found = checkDepInstalled(dep, sys32);
      if (found) {
        report.depsInstalled.push(dep);
      } else {
        report.depsMissing.push(dep);
        report.valid = false;
      }
    }
  }

  return report;
}

function checkDepInstalled(dep: string, sys32: string): boolean {
  if (!sys32 || !fs.existsSync(sys32)) return false;
  switch (dep) {
    case "vcredist":
      return fs.existsSync(path.join(sys32, "vcruntime140.dll"));
    case "d3dcompiler_47":
      return fs.existsSync(path.join(sys32, "d3dcompiler_47.dll"));
    case "dxvk":
      return fs.existsSync(path.join(sys32, "d3d11.dll")) &&
        fs.existsSync(path.join(sys32, "dxgi.dll"));
    default:
      return true;
  }
}

export async function autoFixPrefix(gameId: string, gamePath: string, prefixPath: string): Promise<{ fixed: string[]; errors: string[] }> {
  const fixed: string[] = [];
  const errors: string[] = [];

  const report = checkPrefixHealth(gameId, gamePath, prefixPath);

  if (!report.prefixValid) {
    try {
      const { ensurePrefixDir } = await import("@prefix/core/validate");
      ensurePrefixDir(prefixPath);
      fixed.push("Prefixo recriado");
    } catch (e) {
      errors.push(`Falha ao recriar prefixo: ${e}`);
    }
  }

  if (report.dllOverridesMissing.length > 0) {
    try {
      const { applyWineDllOverrides } = await import("@games/_shared/prefix");
      const gameInfo = gameDllCatalog.getGame(gameId);
      if (gameInfo?.wineDllOverrides) {
        applyWineDllOverrides(prefixPath, gameInfo.wineDllOverrides);
        fixed.push(`DLL overrides aplicados: ${report.dllOverridesMissing.join(", ")}`);
      }
    } catch (e) {
      errors.push(`Falha ao aplicar DLL overrides: ${e}`);
    }
  }

  return { fixed, errors };
}

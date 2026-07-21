import fs from "node:fs";
import path from "node:path";
import { logger } from "@main/services";
import { logCall } from "../activity-logger";
import { normalizePrefixPath } from "./validate";

export type DllOverridesMap = Record<string, string>;

export const BETHESDA_COMMON_DLL_OVERRIDES: DllOverridesMap = {
  "winmm": "native,builtin",
  "version": "native,builtin",
  "d3dcompiler_47": "native",
};

export const MODERN_DIRECTX_DEPS = ["vcredist", "d3dcompiler_47"];

/**
 * Apply DLL overrides to a Wine prefix's user.reg.
 * Supports both Proton (pfx/user.reg) and plain Wine (user.reg) layouts.
 * Creates the prefix directory and minimal user.reg if neither exists.
 */
export function applyWineDllOverrides(
  prefixPath: string,
  overrides: DllOverridesMap,
): void {
  const _start = Date.now();
  prefixPath = normalizePrefixPath(prefixPath);
  if (!prefixPath || Object.keys(overrides).length === 0) {
    logCall("dll-overrides", "applyWineDllOverrides", { prefixPath, overrides }, { skipped: true }, 0);
    return;
  }

  const rootUserReg = path.join(prefixPath, "user.reg");
  const pfxUserReg = path.join(prefixPath, "pfx", "user.reg");

  // Determine layout: if basename is already "pfx", root IS the pfx dir.
  // Otherwise assume compatdata/<id>/ layout (root → pfx/user.reg).
  const isPfxDir = path.basename(prefixPath) === "pfx";

  let userRegPath: string;
  if (fs.existsSync(rootUserReg)) {
    userRegPath = rootUserReg;
  } else if (!isPfxDir && fs.existsSync(pfxUserReg)) {
    userRegPath = pfxUserReg;
  } else if (isPfxDir) {
    userRegPath = rootUserReg;
    if (!fs.existsSync(path.dirname(rootUserReg))) fs.mkdirSync(path.dirname(rootUserReg), { recursive: true });
    fs.writeFileSync(userRegPath, "WINE REGISTRY Version 2\n", "utf-8");
  } else {
    const pfxDir = path.join(prefixPath, "pfx");
    if (!fs.existsSync(pfxDir)) fs.mkdirSync(pfxDir, { recursive: true });
    userRegPath = pfxUserReg;
    fs.writeFileSync(userRegPath, "WINE REGISTRY Version 2\n", "utf-8");
  }

  let content = fs.readFileSync(userRegPath, "utf-8");
  const sectionHeader = "[Software\\\\Wine\\\\DllOverrides]";
  const sectionIdx = content.indexOf(sectionHeader);

  let before: string;
  let after: string;
  if (sectionIdx >= 0) {
    before = content.slice(0, sectionIdx);
    const rest = content.slice(sectionIdx + sectionHeader.length);
    const nextBracket = rest.indexOf("\n[");
    after = nextBracket >= 0 ? rest.slice(nextBracket) : "";
  } else {
    before = content;
    after = "";
  }

  const dllLines = Object.entries(overrides)
    .map(([dll, mode]) => `"${dll.toLowerCase()}"="${mode}"`)
    .join("\n");

  const indentContent = before.endsWith("\n") || before === "" ? before : before + "\n";
  fs.writeFileSync(userRegPath, indentContent + `${sectionHeader}\n${dllLines}\n` + after, "utf-8");
  logger.info(`Applied ${Object.keys(overrides).length} DLL overrides to ${userRegPath}`);
  logCall("dll-overrides", "applyWineDllOverrides", { prefixPath, overrides }, { count: Object.keys(overrides).length, userRegPath }, Date.now() - _start);
}

/**
 * Apply DLL overrides for a specific game via its game module.
 */
export function applyGameDllOverrides(
  _gameId: string,
  _gamePath: string,
  prefixPath: string,
  getWineDllOverrides?: () => DllOverridesMap,
): void {
  if (!getWineDllOverrides) return;
  const overrides = getWineDllOverrides();
  if (overrides && Object.keys(overrides).length > 0) {
    applyWineDllOverrides(prefixPath, overrides);
  }
}

export interface VerifyDllResult {
  ok: boolean
  userRegPath: string
  found: string[]
  missing: string[]
}

/**
 * Verify that DLL overrides were correctly written to user.reg.
 * Reads the [Software\\Wine\\DllOverrides] section and checks each expected entry.
 */
export function verifyDllOverrides(
  prefixPath: string,
  overrides: DllOverridesMap,
): VerifyDllResult {
  const empty: VerifyDllResult = { ok: false, userRegPath: "", found: [], missing: [] };
  prefixPath = normalizePrefixPath(prefixPath);
  if (!prefixPath || Object.keys(overrides).length === 0) return { ...empty, ok: true };

  const rootUserReg = path.join(prefixPath, "user.reg");
  const pfxUserReg = path.join(prefixPath, "pfx", "user.reg");

  let userRegPath: string;
  if (fs.existsSync(rootUserReg)) {
    userRegPath = rootUserReg;
  } else if (fs.existsSync(pfxUserReg)) {
    userRegPath = pfxUserReg;
  } else {
    return { ...empty, missing: Object.keys(overrides) };
  }

  const content = fs.readFileSync(userRegPath, "utf-8");
  const sectionHeader = "[Software\\\\Wine\\\\DllOverrides]";
  const sectionIdx = content.indexOf(sectionHeader);

  if (sectionIdx === -1) {
    return { ok: false, userRegPath, found: [], missing: Object.keys(overrides) };
  }

  const rest = content.slice(sectionIdx + sectionHeader.length);
  const nextBracket = rest.indexOf("\n[");
  const sectionBody = nextBracket >= 0 ? rest.slice(0, nextBracket) : rest;

  const found: string[] = [];
  const missing: string[] = [];

  for (const [dll, mode] of Object.entries(overrides)) {
    const entry = `"${dll.toLowerCase()}"="${mode}"`;
    if (sectionBody.includes(entry)) {
      found.push(dll);
    } else {
      missing.push(dll);
    }
  }

  return { ok: missing.length === 0, userRegPath, found, missing };
}

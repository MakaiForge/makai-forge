import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { logger } from "@main/services";

export function resolvePrefixDir(prefixPath: string): string | null {
  if (!prefixPath) return null;
  prefixPath = prefixPath.replace(/^~($|\/)/, os.homedir() + "$1");
  if (fs.existsSync(path.join(prefixPath, "user.reg"))) return prefixPath;
  if (fs.existsSync(path.join(prefixPath, "pfx", "user.reg"))) return path.join(prefixPath, "pfx");
  return null;
}

export function isValidPrefix(pfxPath: string): boolean {
  return (
    fs.existsSync(path.join(pfxPath, "user.reg")) &&
    fs.existsSync(path.join(pfxPath, "system.reg")) &&
    fs.existsSync(path.join(pfxPath, "drive_c")) &&
    fs.existsSync(path.join(pfxPath, "dosdevices"))
  );
}

export function cleanNestedPfx(pfxPath: string): void {
  // SEGURANÇA: NUNCA apagar uma pasta real — ela pode conter o prefixo Wine
  // de verdade (e o jogo copiado dentro do drive_c). Só removemos SYMLINK
  // (o que o umu-run cria: <prefixo>/pfx → <prefixo>).
  const nested = path.join(pfxPath, "pfx");
  let st: fs.Stats | undefined;
  try {
    st = fs.lstatSync(nested);
  } catch {
    st = undefined; // não existe — ok
  }
  if (st?.isSymbolicLink()) {
    logger.warn(`Nested pfx symlink detected at ${nested}, removing link only`);
    try {
      fs.rmSync(nested, { force: true });
      logger.info(`Removed nested pfx symlink`);
    } catch (err) {
      logger.error(`Failed to remove nested pfx symlink: ${err}`);
    }
  } else if (st?.isDirectory()) {
    // Pasta real com user.reg = prefixo de verdade. NUNCA deletar.
    logger.warn(`Nested pfx DIRECTORY detected at ${nested} — NÃO removido (pode conter dados do jogo)`);
  } else if (fs.existsSync(path.join(nested, "user.reg"))) {
    // Fallback defensivo (lstat falhou): reporta sem deletar.
    logger.warn(`Nested pfx at ${nested} has user.reg — NÃO removido por segurança`);
  }
  // deepNested (<prefixo>/pfx/pfx): só remover se for symlink, nunca pasta real.
  const deepNested = path.join(pfxPath, "pfx", "pfx");
  try {
    const deepSt = fs.lstatSync(deepNested);
    if (deepSt.isSymbolicLink()) {
      fs.rmSync(deepNested, { force: true });
    }
  } catch {
    // não existe — ok
  }
}

export function dllOverridesMatch(prefixPath: string, required: Record<string, string>): boolean {
  const actualPfx = resolvePrefixDir(prefixPath);
  if (!actualPfx) return false;
  const userRegPath = path.join(actualPfx, "user.reg");
  if (!fs.existsSync(userRegPath)) return false;
  try {
    const content = fs.readFileSync(userRegPath, "utf-8");
    const sectionStart = content.indexOf("[Software\\\\Wine\\\\DllOverrides]");
    if (sectionStart < 0) return false;
    const sectionEnd = content.indexOf("\n[", sectionStart + 1);
    const section = sectionEnd >= 0
      ? content.slice(sectionStart, sectionEnd)
      : content.slice(sectionStart);
    for (const [dll, mode] of Object.entries(required)) {
      const search = `"${dll.toLowerCase()}"="${mode}"`;
      if (!section.includes(search)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

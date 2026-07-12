// Re-export from centralized prefix module
export {
  applyWineDllOverrides,
  verifyDllOverrides,
  BETHESDA_COMMON_DLL_OVERRIDES,
  MODERN_DIRECTX_DEPS,
  type DllOverridesMap,
  type VerifyDllResult,
} from "@prefix/core/dll-overrides";

import fs from "node:fs";
import path from "node:path";

function posixToWinePath(p: string): string {
  return "Z:" + p.replace(/\//g, "\\");
}

/**
 * Semeia o registro Bethesda diretamente no system.reg (sem usar proton run reg add).
 *
 * A abordagem anterior usava `proton run reg add` que:
 *  1. Injetava aspas extras no valor ("\"Z:\\...\"")
 *  2. Sobrescrevia o Wow6432Node com o drive mapping do Proton ("S:\\common\\...")
 *
 * Agora escrevemos direto no system.reg, que é mais confiável e rápido.
 */
export function seedBethesdaRegistryWithProton(
  prefixPath: string,
  gamePath: string,
  _protonPath: string,
  registryName: string,
  _steamAppId?: string,
  _libraryPath?: string,
): boolean {
  const winePath = posixToWinePath(gamePath);
  const marker = path.join(prefixPath, ".bethesda_registry_seeded");

  if (fs.existsSync(marker)) {
    console.log(`Registro Bethesda (${registryName}) já configurado (marcador)`);
    return true;
  }

  // Resolve the actual prefix directory (may have pfx/ subpath)
  let pfxDir = prefixPath;
  if (!fs.existsSync(path.join(prefixPath, "user.reg"))) {
    if (fs.existsSync(path.join(prefixPath, "pfx", "user.reg"))) {
      pfxDir = path.join(prefixPath, "pfx");
    } else {
      console.error(`seedBethesdaRegistryWithProton: user.reg não encontrado em ${prefixPath}`);
      return false;
    }
  }

  const systemRegPath = path.join(pfxDir, "system.reg");
  if (!fs.existsSync(systemRegPath)) {
    fs.writeFileSync(systemRegPath, "WINE REGISTRY Version 2\n", "utf-8");
  }

  const sections = [
    `Software\\Bethesda Softworks\\${registryName}`,
    `Software\\Wow6432Node\\Bethesda Softworks\\${registryName}`,
  ];

  let content = fs.readFileSync(systemRegPath, "utf-8");

  for (const section of sections) {
    const sectionEscaped = section.replace(/\\/g, "\\\\");
    const header = `[${sectionEscaped}]`;
    const valueLine = `"Installed Path"="${winePath}"`;

    const headerIdx = content.indexOf(header);

    if (headerIdx >= 0) {
      const sectionEnd = content.indexOf("\n[", headerIdx + 1);
      const sectionBody = sectionEnd >= 0
        ? content.slice(headerIdx, sectionEnd)
        : content.slice(headerIdx);

      if (sectionBody.includes(`"Installed Path"="${winePath}"`)) {
        continue;
      }

      const before = content.slice(0, headerIdx);
      const after = sectionEnd >= 0 ? content.slice(sectionEnd) : "";
      const updatedLines = sectionBody
        .split("\n")
        .filter(line => !line.startsWith('"Installed Path"='))
        .join("\n");
      content = before + updatedLines + "\n" + valueLine + "\n" + after;
    } else {
      if (!content.endsWith("\n")) content += "\n";
      content += header + "\n" + valueLine + "\n";
    }
  }

  fs.writeFileSync(systemRegPath, content, "utf-8");

  try { fs.writeFileSync(marker, ""); } catch {}
  console.log(`Registro Bethesda (${registryName}) configurado: ${winePath}`);
  return true;
}

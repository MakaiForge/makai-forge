import fs from "node:fs";
import path from "node:path";
import { logger } from "@main/services";

function posixToWinePath(p: string): string {
  return "Z:" + p.replace(/\//g, "\\\\");
}

function resolvePfxDir(prefixPath: string): string | null {
  if (!prefixPath) return null;
  if (fs.existsSync(path.join(prefixPath, "user.reg"))) return prefixPath;
  // Only check pfx/ subpath if we're NOT already inside a pfx/ dir
  if (path.basename(prefixPath) !== "pfx" && fs.existsSync(path.join(prefixPath, "pfx", "user.reg"))) {
    return path.join(prefixPath, "pfx");
  }
  return null;
}

export function seedBethesdaRegistry(
  prefixPath: string,
  gamePath: string,
  registryName: string,
): boolean {
  const pfxDir = resolvePfxDir(prefixPath);
  if (!pfxDir) {
    logger.warn(`seedBethesdaRegistry: cannot resolve pfx from ${prefixPath}`);
    return false;
  }

  const systemRegPath = path.join(pfxDir, "system.reg");
  if (!fs.existsSync(systemRegPath)) {
    fs.writeFileSync(systemRegPath, "WINE REGISTRY Version 2\n", "utf-8");
    logger.info(`Created ${systemRegPath} for registry seeding`);
  }

  const wineValue = posixToWinePath(gamePath);
  const sections = [
    `Software\\Bethesda Softworks\\${registryName}`,
    `Software\\Wow6432Node\\Bethesda Softworks\\${registryName}`,
  ];

  let content = fs.readFileSync(systemRegPath, "utf-8");

  for (const section of sections) {
    const sectionEscaped = section.replace(/\\/g, "\\\\");
    const header = `[${sectionEscaped}]`;
    const valueLine = `"Installed Path"="${wineValue}"`;

    const headerIdx = content.indexOf(header);

    if (headerIdx >= 0) {
      const sectionEnd = content.indexOf("\n[", headerIdx + 1);
      const sectionBody = sectionEnd >= 0
        ? content.slice(headerIdx, sectionEnd)
        : content.slice(headerIdx);

      if (sectionBody.includes(`"Installed Path"="${wineValue}"`)) {
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
  logger.info(`Bethesda registry seeded: ${registryName} -> ${wineValue}`);
  return true;
}

export function verifyBethesdaRegistry(
  prefixPath: string,
  registryName: string,
  gamePath?: string,
): boolean {
  const pfxDir = resolvePfxDir(prefixPath);
  if (!pfxDir) return false;

  const systemRegPath = path.join(pfxDir, "system.reg");
  if (!fs.existsSync(systemRegPath)) return false;

  const content = fs.readFileSync(systemRegPath, "utf-8");
  const section = `[Software\\\\Bethesda Softworks\\\\${registryName}]`;

  if (!content.includes(section)) return false;

  if (gamePath) {
    const expected = `"Installed Path"="Z:${gamePath.replace(/\//g, "\\\\")}`;
    if (!content.includes(expected)) return false;
  }

  return true;
}

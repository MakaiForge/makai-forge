import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { SystemPath } from "@main/services/system-path";
import type { ProtonVersion } from "@types";
import { findToolByFolder } from "@proton/main/services/tools";

const isValidProtonDirectory = (directoryPath: string) => {
  const protonFilePath = path.join(directoryPath, "proton");
  return fs.existsSync(protonFilePath);
};

const isProtonTool = (name: string) =>
  findToolByFolder(name) !== undefined;

const getVersionName = (directoryPath: string) => {
  return path.basename(directoryPath);
};

export class Umu {
  public static isValidProtonPath(protonPath: string) {
    return isValidProtonDirectory(protonPath);
  }

  public static async getInstalledProtonVersions(): Promise<ProtonVersion[]> {
    const homePath = SystemPath.getPath("home");

    const compatibilityToolsPath = path.join(
      homePath,
      ".steam",
      "steam",
      "compatibilitytools.d"
    );
    const systemCompatibilityToolsPath = path.join(
      "/usr",
      "share",
      "steam",
      "compatibilitytools.d"
    );
    const appCompatToolsPath = path.join(
      app.getPath("userData"),
      "compat-tools",
      "compatibilitytools.d"
    );

    const versions: ProtonVersion[] = [];

    const compatibilityToolPaths = [
      compatibilityToolsPath,
      systemCompatibilityToolsPath,
      appCompatToolsPath,
    ];

    for (const compatibilityToolPath of compatibilityToolPaths) {
      if (!fs.existsSync(compatibilityToolPath)) {
        continue;
      }

      const compatibilityToolEntries = await fs.promises.readdir(
        compatibilityToolPath,
        { withFileTypes: true }
      );

      for (const entry of compatibilityToolEntries) {
        if (!entry.isDirectory()) continue;
        if (!isProtonTool(entry.name)) continue;

        const candidatePath = path.join(compatibilityToolPath, entry.name);
        if (!isValidProtonDirectory(candidatePath)) continue;

        const realPath = await fs.promises.realpath(candidatePath);

        versions.push({
          name: getVersionName(realPath),
          path: realPath,
          source: "compatibility_tools",
          isInstalled: true,
        });
      }
    }

    const uniqueVersions = new Map<string, ProtonVersion>();
    for (const version of versions) {
      uniqueVersions.set(version.path, version);
    }

    return Array.from(uniqueVersions.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }
}

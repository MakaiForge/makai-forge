import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SystemPath } from "@main/services/system-path";
import { formatGameDirName } from "@main/helpers/format-game-dir-name";

export class Wine {
  public static getProtonForgerPrefixPath(gameTitle: string): string {
    return path.join(os.homedir(), "Games", "MakaiForger", formatGameDirName(gameTitle));
  }

  public static getDefaultPrefixPath(): string | null {
    if (process.platform !== "linux") return null;
    return path.join(SystemPath.getPath("userData"), "wine-prefixes");
  }

  public static getLegacyDefaultPrefixPath(): string | null {
    if (process.platform !== "linux") return null;
    return path.join(SystemPath.getPath("userData"), "wine-prefix");
  }

  public static getDefaultPrefixPathForGame(objectId: string): string | null {
    const defaultPath = this.getDefaultPrefixPath();
    return defaultPath ? path.join(defaultPath, objectId) : null;
  }

  public static getEffectivePrefixPath(
    winePrefixPath?: string | null,
    objectId?: string | null,
    gameTitle?: string | null,
  ): string | null {
    if (winePrefixPath) return winePrefixPath;
    if (gameTitle) return this.getProtonForgerPrefixPath(gameTitle);
    if (!objectId) {
      const legacy = this.getLegacyDefaultPrefixPath();
      if (legacy && fs.existsSync(legacy)) return legacy;
      return null;
    }
    return this.getDefaultPrefixPathForGame(objectId);
  }

  public static validatePrefix(winePrefixPath: string): boolean {
    if (!fs.existsSync(winePrefixPath)) return false;
    return fs.lstatSync(winePrefixPath).isDirectory();
  }
}

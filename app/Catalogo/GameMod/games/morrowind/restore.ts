import path from "node:path";
import { findPrefixUsername } from "../_shared/filemap";
import { pluginsTxtPath } from "./plugins";
import { removePluginsTxtSymlink, removeIniSymlinks, removeProfileSavesSymlink, restoreCore } from "./deploy";

export interface BethesdaRestoreOptions {
  gamePath: string
  gameId: string
  stagingDir: string
  profile: string
  prefixPath?: string
  profileIniFiles?: boolean
  profileSaves?: boolean
  myGamesSubpath?: string
  appDataSubpath?: string
  overwriteDir?: string
}

export async function restoreBethesda(opts: BethesdaRestoreOptions, log?: (msg: string) => void): Promise<void> {
  const dataDir = path.join(opts.gamePath, "Data");

  if (opts.prefixPath && opts.gameId) {
    const username = findPrefixUsername(opts.prefixPath) || "steamuser";
    const pluginsPath = pluginsTxtPath(opts.prefixPath, opts.gameId, username);
    removePluginsTxtSymlink(pluginsPath, log);

    if (opts.myGamesSubpath) {
      const restUsername = username || "steamuser";
      const myGames = path.join(opts.prefixPath, "drive_c/users", restUsername, "Documents/My Games", opts.myGamesSubpath);
      const profileDir = path.join(opts.stagingDir, "..", "profiles", opts.profile);
      const iniDir = path.join(profileDir, "ini files");
      path.join(profileDir, "Saves");

      if (opts.profileIniFiles) removeIniSymlinks(iniDir, myGames, log);
      if (opts.profileSaves) removeProfileSavesSymlink(myGames, log);
    }
  }

  restoreCore(dataDir, opts.overwriteDir, log);
}

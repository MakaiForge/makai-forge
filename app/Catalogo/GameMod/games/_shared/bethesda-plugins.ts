import path from "node:path";

const PLUGIN_EXTS = new Set([".esp", ".esm", ".esl"]);

export { PLUGIN_EXTS };

export function isPluginFile(filename: string): boolean {
  return PLUGIN_EXTS.has(path.extname(filename).toLowerCase());
}

function getGameLocalDir(gameId: string): string {
  const map: Record<string, string> = {
    skyrim_se: "Skyrim Special Edition",
    skyrim: "Skyrim",
    fallout4: "Fallout 4",
    fallout3: "Fallout 3",
    falloutnv: "Fallout New Vegas",
    cyberpunk_2077: "Cyberpunk 2077",
    baldurs_gate_3: "Baldur's Gate 3",
    starfield: "Starfield",
    oblivion: "Oblivion",
    enderal: "Enderal",
  };
  return map[gameId] || gameId;
}

export function pluginsTxtPath(prefixPath: string, gameId: string, username: string | null): string {
  const localDir = getGameLocalDir(gameId);
  return username
    ? path.join(prefixPath, "drive_c", "users", username, "AppData", "Local", localDir, "plugins.txt")
    : path.join(prefixPath || "", "drive_c", "users", "steamuser", "AppData", "Local", localDir, "plugins.txt");
}

export function collectPlugins(filemap: Record<string, string>): string[] {
  return Object.keys(filemap).filter(f => isPluginFile(path.basename(f))).map(name => path.basename(name));
}

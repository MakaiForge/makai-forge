import type { ParsedScriptYaml } from "./types";

const defaultParseResult = (): ParsedScriptYaml => ({
  proton: {},
  config: {},
  env: {},
  wine_overrides: {},
  game: {},
  steam_app_id: null,
  exclude_processes: "",
  install: { dxvk: null, vkd3d: null, esync: null, fsync: null, env: {}, winetricks: [] },
  installer: { exe_name: "", extract_only: false },
  files: [],
});

export function parseScriptYaml(yaml: string): ParsedScriptYaml {
  const result = defaultParseResult();
  const lines = yaml.split("\n");
  let section: string | null = null;
  let sub: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t || t.startsWith("#")) continue;

    const sectionMatch = t.match(/^(\w[\w_-]*):$/);
    if (sectionMatch && !raw.startsWith(" ")) {
      section = sectionMatch[1];
      sub = null;
      continue;
    }

    const subMatch = raw.match(/^  (\w[\w_-]*):$/);
    if (subMatch && section) {
      sub = subMatch[1];
      continue;
    }

    const kvMatch = raw.match(/^    (\w[\w_-]*):\s*(.+)$/);
    if (kvMatch && section && sub) {
      const key = kvMatch[1];
      const val = kvMatch[2].replace(/^["'\s]+|["'\s]+$/g, "");
      if (section === "proton") {
        result.proton[key] = val;
      } else if (section === "system" && sub === "env") {
        result.env[key] = val;
      } else if (section === "wine" && sub === "overrides") {
        result.wine_overrides[key] = val;
      } else if (section === "install" && sub === "env") {
        result.install.env[key] = val;
      }
      continue;
    }

    const listMatch = raw.match(/^    \-\s+(.+)$/);
    if (listMatch && section && sub) {
      const val = listMatch[1].replace(/^["'\s]+|["'\s]+$/g, "");
      if (section === "install" && sub === "winetricks") {
        result.install.winetricks.push(val);
      }
      continue;
    }

    const kvDirect = raw.match(/^  (\w[\w_-]*):\s*(.+)$/);
    if (kvDirect && section && !sub) {
      const key = kvDirect[1];
      const val = kvDirect[2].replace(/^["'\s]+|["'\s]+$/g, "");
      const valLower = val.toLowerCase();
      const boolVal = valLower === "true" ? true : valLower === "false" ? false : val;

      if (section === "game") {
        result.game[key] = val;
      } else if (section === "config") {
        if (val.startsWith("[") && val.endsWith("]")) {
          const items = val.slice(1, -1).split(",").map(s => s.trim().replace(/["']/g, "")).filter(Boolean);
          result.config[key] = items;
        } else {
          result.config[key] = boolVal;
        }
      } else if (section === "proton") {
        result.proton[key] = val;
      } else if (section === "system") {
        if (key === "exclude_processes") {
          result.exclude_processes = val;
        }
      } else if (section === "install") {
        if (["dxvk", "vkd3d", "esync", "fsync"].includes(key)) {
          result.install[key as keyof typeof result.install] = boolVal as any;
        }
      } else if (section === "installer") {
        if (key === "extract_only") {
          result.installer.extract_only = boolVal === true;
        } else {
          (result.installer as any)[key] = val;
        }
      }
      continue;
    }

    const archiveMatch = raw.match(/^ {4,}url:\s*(.+)$/);
    if (archiveMatch && section === "files") {
      result.files.push({ url: archiveMatch[1].replace(/^["'\s]+|["'\s]+$/g, "") });
    }
  }

  return result;
}

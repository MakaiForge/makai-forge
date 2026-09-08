import fs from "node:fs";
import path from "node:path";
import { MakaiRPC } from "@mods-manager/services/makai-rpc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BG3ModInfo {
  uuid: string;
  name: string;
  folder: string;
  version64: string;
  md5: string;
  publishHandle: string;
  modType: string;
  dependencies: string[];
  sourceMod: string;
  isOverrideOnly: boolean;
}

// ---------------------------------------------------------------------------
// System UUIDs (base-game modules — never emitted as user mods)
// ---------------------------------------------------------------------------

const SYSTEM_UUIDS: ReadonlySet<string> = new Set([
  "28ac9ce2-2aba-8cda-b3b5-6e922f71b6b8", // GustavDev
  "991c9c7a-fb80-40cb-8f0d-b92d4e80e9b1", // Gustav
  "cb555efe-2d9e-131f-8195-a89329d218ea", // GustavX
  "ed539163-bb70-431b-96a7-f5b2eda5376b", // Shared
  "3d0c5ff8-c95d-c907-ff3e-34b204f1c630", // SharedDev
  "b77b6210-ac50-4cb1-a3d5-5702fb9c744c", // Honour
  "767d0062-d82c-279c-e16b-dfee7fe94cdd", // HonourX
  "e842840a-2449-588c-b0c4-22122cfce31b", // DiceSet_01
  "b176a0ac-d79f-ed9d-5a87-5c2c80874e10", // DiceSet_02
  "e0a4d990-7b9b-8fa9-d7c6-04017c6cf5b1", // DiceSet_03
  "77a2155f-4b35-4f0c-e7ff-4338f91426a4", // DiceSet_04
  "6efc8f44-cc2a-0273-d4b1-681d3faa411b", // DiceSet_05
  "ee4989eb-aab8-968f-8674-812ea2f4bfd7", // DiceSet_06
  "bf19bab4-4908-ef39-9065-ced469c0f877", // DiceSet_07
  "630daa32-70f8-3da5-41b9-154fe8410236", // MainUI
  "ee5a55ff-eb38-0b27-c5b0-f358dc306d34", // ModBrowser
  "55ef175c-59e3-b44b-3fb2-8f86acc5d550", // PhotoMode
  "e1ce736b-52e6-e713-e9e7-e6abbb15a198", // CrossplayUI
  "9dff4c3b-fda7-43de-a763-ce1383039999", // Engine
]);

const BUILTIN_FOLDERS: ReadonlySet<string> = new Set([
  "gustav", "gustavdev", "gustavx", "shared", "shareddev", "engine", "game",
  "diceset_01", "diceset_02", "diceset_03", "diceset_04", "diceset_05",
  "diceset_06", "diceset_07", "honour", "honourx",
  "modbrowser", "mainui", "crossplayui", "photomode",
]);

const BUILTIN_IGNORE_PATH = "game/gui/assets";

const MOD_FOLDER_PATH_RE = /^(mods|public)\/([^/]+)\/(.+)$/i;

// ---------------------------------------------------------------------------
// Campaign entries (Patch 8 / 7 / 6)
// ---------------------------------------------------------------------------

interface CampaignEntry {
  Folder: string;
  MD5: string;
  Name: string;
  PublishHandle: string;
  UUID: string;
  Version64: string;
}

const GUSTAV_X: CampaignEntry = {
  Folder: "GustavX",
  MD5: "ef3fcba3f3684b3088ad1f9874d4957c",
  Name: "GustavX",
  PublishHandle: "0",
  UUID: "cb555efe-2d9e-131f-8195-a89329d218ea",
  Version64: "145241946983300916",
};

const GUSTAV_DEV: CampaignEntry = {
  Folder: "GustavDev",
  MD5: "",
  Name: "GustavDev",
  PublishHandle: "0",
  UUID: "28ac9ce2-2aba-8cda-b3b5-6e922f71b6b8",
  Version64: "36028797018963968",
};

const GUSTAV_CLASSIC: CampaignEntry = {
  Folder: "Gustav",
  MD5: "",
  Name: "Gustav",
  PublishHandle: "0",
  UUID: "991c9c7a-fb80-40cb-8f0d-b92d4e80e9b1",
  Version64: "36028797018963968",
};

function campaignEntry(patchVersion: number): CampaignEntry {
  if (patchVersion >= 8) return GUSTAV_X;
  if (patchVersion === 7) return GUSTAV_DEV;
  return GUSTAV_CLASSIC;
}

// ---------------------------------------------------------------------------
// XML templates
// ---------------------------------------------------------------------------

const HEADER_P8 = `\
<?xml version="1.0" encoding="UTF-8"?>
<save>
  <version major="4" minor="8" revision="0" build="100"/>
  <region id="ModuleSettings">
    <node id="root">
      <children>
        <node id="Mods">
          <children>
`;

const HEADER_P7 = `\
<?xml version="1.0" encoding="UTF-8"?>
<save>
  <version major="4" minor="7" revision="1" build="3"/>
  <region id="ModuleSettings">
    <node id="root">
      <children>
        <node id="Mods">
          <children>
`;

const HEADER_P6 = `\
<?xml version="1.0" encoding="UTF-8"?>
<save>
  <version major="4" minor="0" revision="9" build="331"/>
  <region id="ModuleSettings">
    <node id="root">
      <children>
        <node id="ModOrder">
          <children>
{MOD_ORDER}\
          </children>
        </node>
        <node id="Mods">
          <children>
`;

const FOOTER_P7 = `\
          </children>
        </node>
      </children>
    </node>
  </region>
</save>
`;

const FOOTER_P6 = FOOTER_P7;

const ENTRY_P7 = (e: Record<string, string>) => `\
            <node id="ModuleShortDesc">
              <attribute id="Folder" type="LSString" value="${esc(e.Folder)}"/>
              <attribute id="MD5" type="LSString" value="${esc(e.MD5)}"/>
              <attribute id="Name" type="LSString" value="${esc(e.Name)}"/>
              <attribute id="PublishHandle" type="uint64" value="${esc(e.PublishHandle)}"/>
              <attribute id="UUID" type="guid" value="${esc(e.UUID)}"/>
              <attribute id="Version64" type="int64" value="${esc(e.Version64)}"/>
            </node>
`;

const ENTRY_P6 = (e: Record<string, string>) => `\
            <node id="ModuleShortDesc">
              <attribute id="Folder" value="${esc(e.Folder)}" type="LSString"/>
              <attribute id="MD5" value="${esc(e.MD5)}" type="LSString"/>
              <attribute id="Name" value="${esc(e.Name)}" type="LSString"/>
              <attribute id="UUID" value="${esc(e.UUID)}" type="FixedString"/>
              <attribute id="Version64" value="${esc(e.Version64)}" type="int64"/>
            </node>
`;

const MOD_ORDER_P6 = (uuid: string) => `\
            <node id="Module">
              <attribute id="UUID" value="${esc(uuid)}" type="FixedString"/>
            </node>
`;

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// meta.lsx parsing (from extracted XML text)
// ---------------------------------------------------------------------------

function attrValue(nodeText: string, attrId: string): string {
  // Simple regex extraction — avoids heavy XML parser dependency
  const re = new RegExp(`<attribute\\s+id="${attrId}"[^>]*value="([^"]*)"`, "i");
  const m = nodeText.match(re);
  return m ? m[1] : "";
}

function repairMetaXml(xml: string): string {
  // Escape bare & and < > in attribute values
  return xml
    .replace(/&(?!amp;|apos;|quot;|gt;|lt;|#\d+;|#x[0-9A-Fa-f]+;)/g, "&amp;")
    .replace(/value="([^"]*?)<(?!\/)/g, 'value="$1&lt;')
    .replace(/value="([^"]*?)(?<!")>"/g, 'value="$1&gt;"');
}

function parseMetaLsx(xmlText: string): BG3ModInfo | null {
  // Try parsing, repair if needed
  let text = xmlText;
  // Find ModuleInfo node (everything from <node id="ModuleInfo" to </node>)
  let moduleInfoMatch = text.match(/<node\s+id="ModuleInfo"[\s\S]*?<\/node>/i);
  if (!moduleInfoMatch) {
    text = repairMetaXml(xmlText);
    moduleInfoMatch = text.match(/<node\s+id="ModuleInfo"[\s\S]*?<\/node>/i);
  }
  if (!moduleInfoMatch) return null;

  const mi = moduleInfoMatch[0];
  const uuid = attrValue(mi, "UUID");
  if (!uuid) return null;

  const name = attrValue(mi, "Name");
  const folder = attrValue(mi, "Folder");
  const version64 = attrValue(mi, "Version64");
  const md5 = attrValue(mi, "MD5");
  const publishHandle = attrValue(mi, "PublishHandle") || "0";
  const modType = attrValue(mi, "Type");

  // Parse dependencies
  const deps: string[] = [];
  const depsMatch = text.match(/<node\s+id="Dependencies"[\s\S]*?<\/node>/i);
  if (depsMatch) {
    const depBlock = depsMatch[0];
    const depUuidRe = /<node\s+id="ModuleShortDesc"[\s\S]*?<\/node>/gi;
    let depMatch;
    while ((depMatch = depUuidRe.exec(depBlock)) !== null) {
      const depUuid = attrValue(depMatch[0], "UUID");
      if (depUuid && !SYSTEM_UUIDS.has(depUuid)) {
        deps.push(depUuid);
      }
    }
  }

  return {
    uuid,
    name,
    folder,
    version64,
    md5,
    publishHandle,
    modType,
    dependencies: deps,
    sourceMod: "",
    isOverrideOnly: false,
  };
}

// ---------------------------------------------------------------------------
// .pak file scanning via 7z
// ---------------------------------------------------------------------------

const _META_PATH_RE = /^mods\/([^/]+)\/meta\.lsx$/i;

function chooseMeta(candidates: Array<{ path: string; content: string }>, pakName: string): { path: string; content: string } | null {
  if (candidates.length === 0) return null;
  const anchored = candidates.filter(c => _META_PATH_RE.test(c.path));
  if (anchored.length === 0) return candidates[0];
  if (anchored.length > 1) {
    const pakLower = pakName.toLowerCase();
    const match = anchored.find(c => {
      const m = c.path.match(_META_PATH_RE);
      return m && pakLower.includes(m[1].toLowerCase());
    });
    if (match) return match;
  }
  return anchored[0];
}

async function extractMetaFromPak(pakPath: string): Promise<{ metaXml: string | null; fileNames: string[] }> {
  const fileNames: string[] = [];

  try {
    const archiveInfo = await MakaiRPC.call<{ entries: Array<{ path: string }> }>("read_archive", {
      archive: pakPath,
    });

    fileNames.push(...archiveInfo.entries.map(e => e.path.replace(/\\/g, "/")));

    const metaCandidates: Array<{ path: string; content: string }> = [];
    for (const entry of archiveInfo.entries) {
      const fp = entry.path.replace(/\\/g, "/");
      if (fp.toLowerCase().endsWith("meta.lsx")) {
        try {
          const result = await MakaiRPC.call<{ content: string }>("extract_file_to_string", {
            archive: pakPath,
            filepath: fp,
          });
          metaCandidates.push({ path: fp, content: result.content });
        } catch {
          // Skip unreadable meta files
        }
      }
    }

    const chosen = chooseMeta(metaCandidates, path.basename(pakPath));
    return { metaXml: chosen?.content ?? null, fileNames };
  } catch {
    return { metaXml: null, fileNames };
  }
}

function classifyPakFiles(fileNames: string[]): { overridesBuiltin: boolean; hasOwnData: boolean } {
  let overridesBuiltin = false;
  let hasOwnData = false;

  for (const name of fileNames) {
    const nl = name.replace(/\\/g, "/").toLowerCase();
    const m = MOD_FOLDER_PATH_RE.exec(nl);
    if (!m) continue;
    if (nl.endsWith("/meta.lsx")) continue;
    if (BUILTIN_FOLDERS.has(m[2])) {
      if (!nl.includes(BUILTIN_IGNORE_PATH)) {
        overridesBuiltin = true;
      }
    } else {
      hasOwnData = true;
    }
  }

  return { overridesBuiltin, hasOwnData };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ScanResult {
  modInfos: Map<string, BG3ModInfo>;
  noMetadata: string[];
}

/**
 * Scan .pak files for all enabled mods and return { uuid → BG3ModInfo }.
 * Uses 7z to extract meta.lsx from .pak archives.
 */
export async function scanModPaks(
  stagingDir: string,
  enabledModNames: string[],
  log?: (msg: string) => void,
): Promise<ScanResult> {
  const modInfos = new Map<string, BG3ModInfo>();
  const noMetadata: string[] = [];

  for (const modName of enabledModNames) {
    const modDir = path.join(stagingDir, modName);
    if (!fs.existsSync(modDir)) continue;

    const paks = findPaks(modDir);
    let gotMeta = false;

    for (const pakPath of paks) {
      const { metaXml, fileNames } = await extractMetaFromPak(pakPath);
      if (!metaXml) continue;

      const info = parseMetaLsx(metaXml);
      if (!info) continue;

      if (SYSTEM_UUIDS.has(info.uuid)) {
        gotMeta = true;
        continue;
      }

      const { overridesBuiltin, hasOwnData } = classifyPakFiles(fileNames);
      info.isOverrideOnly = overridesBuiltin && !hasOwnData;
      info.sourceMod = modName;
      modInfos.set(info.uuid, info);
      gotMeta = true;
    }

    if (paks.length > 0 && !gotMeta) {
      noMetadata.push(`${modName} (${paks.length} pak(s): no meta.lsx)`);
    }
  }

  log?.(`  Scanned ${enabledModNames.length} mods, found metadata for ${modInfos.size} pak(s)`);
  if (noMetadata.length > 0) {
    log?.(`  ${noMetadata.length} mod(s) had no metadata (won't appear in load order)`);
  }

  return { modInfos, noMetadata };
}

function findPaks(dir: string): string[] {
  const result: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...findPaks(full));
    } else if (entry.name.toLowerCase().endsWith(".pak")) {
      result.push(full);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Topological sort (dependency-aware load order)
// ---------------------------------------------------------------------------

export function resolveLoadOrder(
  enabledModNames: string[],
  modInfos: Map<string, BG3ModInfo>,
): BG3ModInfo[] {
  const bySource = new Map<string, BG3ModInfo[]>();
  for (const info of modInfos.values()) {
    if (!info.sourceMod) continue;
    const list = bySource.get(info.sourceMod) || [];
    list.push(info);
    bySource.set(info.sourceMod, list);
  }

  const added = new Set<string>();
  const result: BG3ModInfo[] = [];

  function insert(info: BG3ModInfo): void {
    if (added.has(info.uuid)) return;
    for (const depUuid of info.dependencies) {
      const dep = modInfos.get(depUuid);
      if (dep) insert(dep);
    }
    added.add(info.uuid);
    result.push(info);
  }

  for (const modName of enabledModNames) {
    const infos = bySource.get(modName);
    if (infos) {
      for (const info of infos) {
        insert(info);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// modsettings.lsx generation
// ---------------------------------------------------------------------------

export function buildModsettingsXml(
  orderedMods: BG3ModInfo[],
  patchVersion: number = 8,
  campaign: BG3ModInfo | null = null,
): string {
  if (patchVersion <= 6) return buildXmlP6(orderedMods, campaign);
  return buildXmlP7(orderedMods, patchVersion, campaign);
}

function campaignDict(patchVersion: number, campaign: BG3ModInfo | null): Record<string, string> {
  if (!campaign) return { ...campaignEntry(patchVersion) };
  return {
    Folder: campaign.folder,
    MD5: campaign.md5,
    Name: campaign.name,
    PublishHandle: campaign.publishHandle || "0",
    UUID: campaign.uuid,
    Version64: version64OrDefault(campaign),
  };
}

function version64OrDefault(info: BG3ModInfo): string {
  const v = parseInt(info.version64, 10);
  if (isNaN(v) || v === 0 || v === 1 || v === 268435456) {
    return "36028797018963968";
  }
  return String(v);
}

function buildXmlP7(
  orderedMods: BG3ModInfo[],
  patchVersion: number,
  campaign: BG3ModInfo | null,
): string {
  const header = patchVersion >= 8 ? HEADER_P8 : HEADER_P7;
  const parts = [header];

  const camp = campaignDict(patchVersion, campaign);
  parts.push(ENTRY_P7(camp));

  for (const mod of orderedMods) {
    parts.push(ENTRY_P7({
      Folder: mod.folder,
      MD5: mod.md5,
      Name: mod.name,
      PublishHandle: mod.publishHandle || "0",
      UUID: mod.uuid,
      Version64: version64OrDefault(mod),
    }));
  }

  parts.push(FOOTER_P7);
  return parts.join("");
}

function buildXmlP6(
  orderedMods: BG3ModInfo[],
  campaign: BG3ModInfo | null,
): string {
  const camp = campaignDict(6, campaign);

  // ModOrder block
  const modOrderParts = [MOD_ORDER_P6(camp.UUID)];
  for (const mod of orderedMods) {
    modOrderParts.push(MOD_ORDER_P6(mod.uuid));
  }

  const parts = [HEADER_P6.replace("{MOD_ORDER}", modOrderParts.join(""))];

  // Mods block — campaign first
  parts.push(ENTRY_P6({
    Folder: camp.Folder,
    MD5: camp.MD5,
    Name: camp.Name,
    UUID: camp.UUID,
    Version64: camp.Version64,
  }));

  for (const mod of orderedMods) {
    parts.push(ENTRY_P6({
      Folder: mod.folder,
      MD5: mod.md5,
      Name: mod.name,
      UUID: mod.uuid,
      Version64: version64OrDefault(mod),
    }));
  }

  parts.push(FOOTER_P6);
  return parts.join("");
}

/**
 * End-to-end: scan paks, resolve order, write modsettings.lsx.
 * Returns the number of mod entries written.
 */
export async function writeModsettings(
  modsettingsPath: string,
  stagingDir: string,
  enabledModNames: string[],
  patchVersion: number = 8,
  log?: (msg: string) => void,
): Promise<number> {
  log?.(`Scanning .pak files for mod metadata (patch ${patchVersion}) ...`);

  const { modInfos } = await scanModPaks(stagingDir, enabledModNames, log);

  if (modInfos.size === 0) {
    log?.("No mod metadata found — writing vanilla modsettings.lsx.");
    const xml = buildModsettingsXml([], patchVersion);
    fs.mkdirSync(path.dirname(modsettingsPath), { recursive: true });
    fs.writeFileSync(modsettingsPath, xml, "utf-8");
    return 0;
  }

  // Filter override-only paks
  const overrideOnly = [...modInfos.values()].filter(m => m.isOverrideOnly);
  const eligible = new Map<string, BG3ModInfo>();
  for (const [uuid, info] of modInfos) {
    if (!info.isOverrideOnly) eligible.set(uuid, info);
  }

  if (overrideOnly.length > 0) {
    log?.(`  ${overrideOnly.length} pak(s) only override base-game files — loaded automatically`);
  }

  // Resolve load order
  log?.("Resolving load order with dependency sorting ...");
  const ordered = resolveLoadOrder(enabledModNames, eligible);

  // Detect Adventure mods (custom campaign)
  let campaignMod: BG3ModInfo | null = null;
  const adventures = ordered.filter(m => m.modType === "Adventure");
  if (adventures.length > 0) {
    campaignMod = adventures[adventures.length - 1]; // highest priority wins
    if (adventures.length > 1) {
      log?.(`  WARNING: multiple Adventure mods installed — using '${campaignMod.name}'`);
    }
    log?.(`  Adventure mod '${campaignMod.name}' set as campaign`);
  }

  // Check missing dependencies
  const allUuids = new Set([...modInfos.keys(), ...SYSTEM_UUIDS]);
  for (const mod of ordered) {
    for (const depUuid of mod.dependencies) {
      if (!allUuids.has(depUuid)) {
        log?.(`  WARNING: ${mod.name} depends on UUID ${depUuid} which is not installed`);
      }
    }
  }

  // Build and write XML
  const xml = buildModsettingsXml(ordered, patchVersion, campaignMod);
  fs.mkdirSync(path.dirname(modsettingsPath), { recursive: true });
  fs.writeFileSync(modsettingsPath, xml, "utf-8");

  log?.(`Wrote modsettings.lsx with ${ordered.length} mod(s)`);
  return ordered.length;
}

/**
 * Write a clean vanilla modsettings.lsx with only the campaign entry.
 */
export function writeVanillaModsettings(
  modsettingsPath: string,
  patchVersion: number = 8,
  log?: (msg: string) => void,
): void {
  const xml = buildModsettingsXml([], patchVersion);
  fs.mkdirSync(path.dirname(modsettingsPath), { recursive: true });
  fs.writeFileSync(modsettingsPath, xml, "utf-8");
  log?.(`Reset modsettings.lsx to vanilla (${campaignEntry(patchVersion).Name} only)`);
}

import fs from "node:fs";

const PLUGIN_EXTS = new Set([".esp", ".esm", ".esl"]);

function parseMasters(filePath: string): string[] {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 20) return [];

  const sig = buf.toString("ascii", 0, 4);
  if (sig !== "TES4") return [];

  // Try 4-byte record size (SSE/FO4+)
  const dataSize4 = buf.readUInt32LE(4);
  const dataStart4 = 12; // 4 type + 4 size + 4 flags
  let masters = tryParseSubrecords(buf, dataStart4, dataSize4);

  if (masters.length > 0) return masters;

  // Fallback to 2-byte record size (Oblivion/FO3/FNV)
  const dataSize2 = buf.readUInt16LE(4);
  const dataStart2 = 8; // 4 type + 2 size + 2 flags
  return tryParseSubrecords(buf, dataStart2, dataSize2);
}

function tryParseSubrecords(buf: Buffer, start: number, dataSize: number): string[] {
  const masters: string[] = [];
  let offset = start;
  const end = start + dataSize;

  while (offset + 6 <= end) {
    const type = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt16LE(offset + 4);
    const dataOffset = offset + 6;

    if (dataOffset + size > buf.length) break;

    if (type === "MAST") {
      // MAST data is a null-terminated string
      const name = buf.toString("utf-8", dataOffset, dataOffset + size).replace(/\0+$/, "").trim();
      if (name) masters.push(name);
    }

    offset = dataOffset + size;
    // Subrecords are 2-byte aligned
    if (offset % 2 !== 0) offset++;
  }

  return masters;
}

function topologicalSort(
  plugins: string[],
  getMasters: (name: string) => string[]
): string[] {
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const p of plugins) {
    if (!graph.has(p)) graph.set(p, []);
    if (!inDegree.has(p)) inDegree.set(p, 0);
  }

  for (const p of plugins) {
    const masters = getMasters(p);
    for (const m of masters) {
      // Only consider masters that are in our plugin list
      if (!graph.has(m)) continue;
      graph.get(m)!.push(p);
      inDegree.set(p, (inDegree.get(p) || 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [p, deg] of inDegree) {
    if (deg === 0) queue.push(p);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const dep of graph.get(node) || []) {
      const newDeg = (inDegree.get(dep) || 1) - 1;
      inDegree.set(dep, newDeg);
      if (newDeg === 0) queue.push(dep);
    }
  }

  // Add any remaining (unreachable) plugins
  for (const p of plugins) {
    if (!sorted.includes(p)) sorted.push(p);
  }

  return sorted;
}

export class PluginSortService {

  static parseMasters(filePath: string): string[] {
    return parseMasters(filePath);
  }

  /** Sort plugins by dependency order. `pluginPaths` maps plugin name → full path. */
  static sort(
    pluginNames: string[],
    pluginPaths: Record<string, string>
  ): string[] {
    const getMasters = (name: string): string[] => {
      const filePath = pluginPaths[name];
      if (!filePath || !fs.existsSync(filePath)) return [];
      try {
        return parseMasters(filePath);
      } catch {
        return [];
      }
    };

    return topologicalSort(pluginNames, getMasters);
  }
}

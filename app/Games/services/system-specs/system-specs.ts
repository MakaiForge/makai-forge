import os from "node:os";
import cp from "node:child_process";
import { ModStorageService } from "@mods/services/mod-storage-service";
import { logger } from "@main/services/logger";

/**
 * SystemSpecs — Coleta e salva as especificações do hardware do usuário
 * (CPU, memória, GPU) na primeira execução e verifica compatibilidade dos
 * jogos do catálogo (mínimo / recomendado).
 *
 * Storage key: "system:specs" no mods-store.json
 */

export interface SystemSpecs {
  /** Versão do formato — bump força re-coleta (ex.: clock corrigido via lscpu) */
  version?: number
  collectedAt: number
  cpu: {
    model: string
    cores: number
    /** Clock base em GHz (estimado) */
    baseClockGhz: number
  }
  memory: {
    totalBytes: number
    totalGb: number
  }
  gpu: {
    name: string
    /** Fabricante normalizado: nvidia | amd | intel | unknown */
    vendor: "nvidia" | "amd" | "intel" | "unknown"
    /** VRAM em MB, quando detectável */
    vramMb: number
  }
  os: {
    platform: string
    release: string
  }
}

export interface GameRequirementSpec {
  /** GPU mínima exigida (texto cru, ex.: "Nvidia GeForce GTX 770 2GB") */
  gpu?: string
  /** RAM mínima em GB */
  ramGb?: number
  /** CPU mínima (texto cru) */
  cpu?: string
  /** Armazenamento em GB */
  storageGb?: number
}

export type CompatibilityLevel = "ok" | "weak" | "no" | "unknown";

export interface CompatibilityResult {
  level: CompatibilityLevel
  label: string
  /** Lista de recursos que ficam abaixo do mínimo */
  below: string[]
  /** Lista de recursos que atendem (resumo) */
  met: string[]
  checkedAt: number
}

const STORE_KEY = "system:specs";
/** Bump quando o collector mudar (ex.: v2 = clock base/turbo via lscpu) */
const SPECS_VERSION = 2;

/** Cache em memória após primeira coleta */
let cached: SystemSpecs | null = null;

function run(cmd: string, args: string[], timeoutMs = 5000): string {
  try {
    const r = cp.spawnSync(cmd, args, { encoding: "utf-8", timeout: timeoutMs, stdio: "pipe" });
    if (r.status === 0 && r.stdout) return r.stdout.toString();
    return "";
  } catch {
    return "";
  }
}

function getCpuModel(): string {
  const model = os.cpus()[0]?.model || "";
  return model.replace(/\s+/g, " ").trim();
}

/**
 * Extrai o MHz máximo do texto do `lscpu`. Lida com locale EN ("CPU max MHz:")
 * e PT-BR ("CPU MHz máx.:") e com separador decimal vírgula (",").
 * Retorna 0 se não encontrar.
 */
export function lscpuMaxMhz(lscpuText: string): number {
  if (!lscpuText) return 0;
  const m =
    lscpuText.match(/CPU\s+MHz\s+m[aá]x\.?:\s*([\d.,]+)/i) ||
    lscpuText.match(/CPU\s+max\s+MHz:\s*([\d.,]+)/i);
  if (!m) return 0;
  const ghz = parseFloat(m[1].replace(",", ".")) / 1000;
  return Math.round(ghz * 10) / 10;
}

function getBaseClockGhz(): number {
  // lscpu reporta o MHz máximo (turbo/base) — o os.cpus()[0].speed no Linux
  // devolve o clock ATUAL (muitas vezes idle, ex.: 1.2GHz num Xeon 2.3GHz),
  // o que fazia jogos leves como Left 4 Dead falharem na comparação de GHz.
  const lscpu = run("lscpu", []);
  const fromLscpu = lscpuMaxMhz(lscpu);
  if (fromLscpu > 0) return fromLscpu;
  const ghz = os.cpus()[0]?.speed || 0;
  if (ghz > 0) return Math.round((ghz / 1000) * 10) / 10;
  return 0;
}

function getTotalRamGb(): number {
  const bytes = os.totalmem();
  return Math.round((bytes / (1024 * 1024 * 1024)) * 10) / 10;
}

function normalizeVendor(name: string): SystemSpecs["gpu"]["vendor"] {
  const n = name.toLowerCase();
  if (n.includes("nvidia") || n.includes("geforce") || n.includes("quadro") || n.includes("rtx") || n.includes("gtx")) return "nvidia";
  if (n.includes("amd") || n.includes("radeon") || n.includes("rx ") || n.includes("vega")) return "amd";
  if (n.includes("intel") || n.includes("uhd") || n.includes("iris") || n.includes("hd graphics")) return "intel";
  return "unknown";
}

function getVramMb(name: string): number {
  const m = name.match(/(\d+)\s*(?:GB|MB)/i);
  if (!m) return 0;
  const v = parseInt(m[1], 10);
  return /gb/i.test(m[0]) ? v * 1024 : v;
}

function getGpu(): SystemSpecs["gpu"] {
  // 1. nvidia-smi (mais confiável p/ NVIDIA)
  const nv = run("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]);
  if (nv) {
    const line = nv.trim().split("\n")[0] || "";
    const [name, vram] = line.split(",").map((s) => s.trim());
    const vramMb = vram ? parseInt(vram, 10) || 0 : 0;
    return { name, vendor: "nvidia", vramMb };
  }

  // 2. vulkaninfo (lista dispositivos Vulkan — cobre AMD/Intel/NVIDIA)
  const vi = run("vulkaninfo", ["--summary"]);
  if (vi) {
    const match = vi.match(/deviceName\s*=\s*(.+)/);
    if (match) {
      const name = match[1].trim();
      return { name, vendor: normalizeVendor(name), vramMb: getVramMb(name) };
    }
  }

  // 3. lspci (fallback universal no Linux)
  const lspci = run("lspci", []);
  if (lspci) {
    const line = lspci
      .split("\n")
      .find((l) => /vga|3d|display/i.test(l) && !/audio|controller/i.test(l));
    if (line) {
      const name = line.replace(/^[0-9a-f:.]+/, "").replace(/\[.*?\]/g, "").replace(/controller:|vga compatible/i, "").replace(/\s+/g, " ").trim();
      return { name, vendor: normalizeVendor(name), vramMb: getVramMb(name) };
    }
  }

  // 4. glxinfo
  const glx = run("glxinfo", ["-B"]);
  if (glx) {
    const match = glx.match(/OpenGL renderer string:\s*(.+)/);
    if (match) {
      const name = match[1].trim();
      return { name, vendor: normalizeVendor(name), vramMb: getVramMb(name) };
    }
  }

  return { name: "Desconhecida", vendor: "unknown", vramMb: 0 };
}

export function collectSystemSpecs(): SystemSpecs {
  if (cached) return cached;

  const gpu = getGpu();
  const specs: SystemSpecs = {
    version: SPECS_VERSION,
    collectedAt: Date.now(),
    cpu: {
      model: getCpuModel(),
      cores: os.cpus().length,
      baseClockGhz: getBaseClockGhz(),
    },
    memory: {
      totalBytes: os.totalmem(),
      totalGb: getTotalRamGb(),
    },
    gpu,
    os: {
      platform: os.platform(),
      release: os.release(),
    },
  };

  cached = specs;
  try {
    ModStorageService.put(STORE_KEY, specs);
  } catch (err) {
    logger.warn(`[SystemSpecs] Falha ao salvar specs: ${err}`);
  }

  logger.info(`[SystemSpecs] Coletado: ${specs.cpu.model} | ${specs.memory.totalGb}GB | ${specs.gpu.name}`);
  return specs;
}

export function getStoredSystemSpecs(): SystemSpecs | null {
  if (cached) return cached;
  const stored = ModStorageService.get<SystemSpecs>(STORE_KEY);
  // Só aceita specs com o formato atual — versão antiga (ex.: clock idle) é
  // descartada e a coleta roda de novo na primeira execução.
  if (stored && stored.version === SPECS_VERSION && stored.cpu?.model && stored.gpu?.name) {
    cached = stored;
    return stored;
  }
  return null;
}

export function getSystemSpecs(): SystemSpecs {
  return getStoredSystemSpecs() || collectSystemSpecs();
}

/**
 * Extrai requisitos estruturados do texto cru do catálogo (formato Steam).
 * Ex.: "Processor: Intel Core i5-2500K / AMD FX-6300" →
 *      { cpu: "Intel Core i5-2500K", ramGb: 8, gpu: "Nvidia GeForce GTX 770" }
 */
export function parseRequirements(raw: string | null | undefined): GameRequirementSpec {
  const out: GameRequirementSpec = {};
  if (!raw) return out;

  // Memória: "Memory: 8 GB RAM"
  const mem = raw.match(/memory:\s*(\d+(?:\.\d+)?)\s*GB/i);
  if (mem) out.ramGb = parseFloat(mem[1]);

  // Armazenamento: "Storage: 150 GB available space"
  const stg = raw.match(/storage:\s*(\d+(?:\.\d+)?)\s*GB/i);
  if (stg) out.storageGb = parseFloat(stg[1]);

  // Fronteira de campo: captura para no próximo campo conhecido do formato
  // Steam (o texto muitas vezes NÃO tem quebras de linha nem "/").
  const FIELD_BOUNDARY =
    /(?=\s*(?:memory|graphics|directx|storage|network|sound\s*card|hard\s*drive|additional\s*notes|os\s*[:*]|processor|requires)\s*[:*])/i;

  // CPU: campo "Processor:" até o próximo campo
  const cpuMatch = raw.match(
    new RegExp(`processor\\s*[:*]\\s*([^\\n]+?)${FIELD_BOUNDARY.source}`, "i"),
  );
  if (cpuMatch) out.cpu = cpuMatch[1].replace(/[:\n]/g, "").trim();

  // GPU: campo "Graphics:" até o próximo campo
  const gpuMatch = raw.match(
    new RegExp(`graphics\\s*[:*]\\s*([^\\n]+?)${FIELD_BOUNDARY.source}`, "i"),
  );
  if (gpuMatch) out.gpu = gpuMatch[1].replace(/[:\n]/g, "").trim();

  return out;
}

/**
 * Compara as specs do sistema com os requisitos (mínimo).
 * Nível:
 *  - ok      → atende o mínimo (ou requisitos desconhecidos)
 *  - weak    → atende parcialmente (ex.: RAM ok, GPU abaixo)
 *  - no      → não atende o mínimo
 *  - unknown → sem requisitos no catálogo
 */
export function checkCompatibility(
  specs: SystemSpecs,
  minimumRaw: string | null | undefined,
  recommendedRaw: string | null | undefined,
): CompatibilityResult {
  const below: string[] = [];
  const met: string[] = [];

  const min = parseRequirements(minimumRaw);
  parseRequirements(recommendedRaw); // recomendado é informativo — comparação usa o mínimo

  // Sem requisitos mínimos → não dá pra afirmar
  if (!min.ramGb && !min.gpu && !min.cpu) {
    return { level: "unknown", label: "Requisitos não informados", below, met, checkedAt: Date.now() };
  }

  // RAM
  if (min.ramGb) {
    if (specs.memory.totalGb >= min.ramGb) {
      met.push(`RAM ${specs.memory.totalGb}GB ≥ ${min.ramGb}GB`);
    } else {
      below.push(`RAM ${specs.memory.totalGb}GB < ${min.ramGb}GB`);
    }
  }

  // GPU
  if (min.gpu) {
    const okGpu = gpuMeetsRequirement(specs.gpu.name, min.gpu);
    if (okGpu) {
      met.push(`GPU atende (${specs.gpu.name})`);
    } else {
      below.push(`GPU abaixo do mínimo (${min.gpu})`);
    }
  }

  // CPU (heurística leve: conta núcleos — não compara modelos diretamente)
  if (min.cpu) {
    const cpuOk = cpuMeetsRequirement(specs.cpu, min.cpu);
    if (cpuOk) {
      met.push(`CPU atende (${specs.cpu.model})`);
    } else {
      below.push(`CPU possivelmente abaixo (mín.: ${min.cpu})`);
    }
  }

  if (below.length === 0) {
    return { level: "ok", label: "Roda no mínimo", below, met, checkedAt: Date.now() };
  }
  // GPU/RAM abaixo do mínimo → não atende. CPU abaixo é heurística fraca → weak.
  const blocking = below.some((b) => b.includes("RAM") || b.includes("GPU"));
  if (blocking) {
    return { level: "no", label: "Pode não rodar", below, met, checkedAt: Date.now() };
  }
  return { level: "weak", label: "Roda com ressalvas", below, met, checkedAt: Date.now() };
}

function gpuMeetsRequirement(systemGpu: string, requiredGpu: string): boolean {
  const sys = systemGpu.toLowerCase();
  const req = requiredGpu.toLowerCase();

  // Modelos-chave para comparação relativa (geraçoes aproximadas)
  const nvidiaTier = (n: string): number => {
    if (/rtx\s*40|rtx\s*50/.test(n)) return 8;
    if (/rtx\s*30/.test(n)) return 7;
    if (/rtx\s*20/.test(n)) return 6;
    if (/gtx\s*16/.test(n)) return 5;
    if (/gtx\s*10/.test(n)) return 4;
    if (/gtx\s*9|gtx\s*900/.test(n)) return 3;
    if (/gtx\s*7|gtx\s*700/.test(n)) return 2;
    return 0;
  };
  const amdTier = (n: string): number => {
    if (/rx\s*7|rx\s*6000|rdna2|rdna3/.test(n)) return 6;
    if (/rx\s*5|rx\s*5700|rx\s*5600/.test(n)) return 5;
    if (/rx\s*4|vega/.test(n)) return 4;
    if (/rx\s*3/.test(n)) return 3;
    if (/r9|rx\s*2/.test(n)) return 2;
    return 0;
  };

  // Número do modelo dentro da MESMA série (ex.: GTX 770 vs GTX 760) —
  // comparação direta mais precisa que o tier.
  const modelNumber = (n: string, prefix: string): number => {
    const m = n.match(new RegExp(prefix + "\\s*(\\d{3,4})", "i"));
    return m ? parseInt(m[1], 10) : 0;
  };
  const sysGtxNum = modelNumber(sys, "gtx");
  const reqGtxNum = modelNumber(req, "gtx");
  if (sysGtxNum > 0 && reqGtxNum > 0) return sysGtxNum >= reqGtxNum;
  const sysRtxNum = modelNumber(sys, "rtx");
  const reqRtxNum = modelNumber(req, "rtx");
  if (sysRtxNum > 0 && reqRtxNum > 0) return sysRtxNum >= reqRtxNum;
  const sysRxNum = modelNumber(sys, "rx");
  const reqRxNum = modelNumber(req, "rx");
  if (sysRxNum > 0 && reqRxNum > 0) return sysRxNum >= reqRxNum;

  const sysNv = nvidiaTier(sys);
  const reqNv = nvidiaTier(req);
  if (sysNv > 0 && reqNv > 0) return sysNv >= reqNv;

  const sysAmd = amdTier(sys);
  const reqAmd = amdTier(req);
  if (sysAmd > 0 && reqAmd > 0) return sysAmd >= reqAmd;

  // Fallback: se a GPU do sistema é da mesma família ou não dá pra comparar,
  // assume ok (não bloquear jogo por heurística fraca).
  return true;
}

function cpuMeetsRequirement(specCpu: { model: string; cores: number; baseClockGhz: number }, requiredCpu: string): boolean {
  // Comparação segura: só NÚCLEOS quando o requisito declara explicitamente
  // (ex.: "4 Core"). Clock em GHz é INFORMATIVO — comparar GHz entre gerações/
  // arquiteturas é enganoso (Pentium 4 3.0GHz vs Xeon 2.3GHz 16 cores) e o
  // clock coletado varia com turbo/idle. GHz nunca bloqueia sozinho.
  void specCpu.baseClockGhz;
  const req = requiredCpu.toLowerCase();
  const coreMatch = req.match(/(\d+)[-\s]*(?:core|núcleo)/i);
  if (coreMatch) {
    const reqCores = parseInt(coreMatch[1], 10);
    if (specCpu.cores < reqCores) return false;
  }
  return true;
}

import { describe, it, expect, vi } from "vitest";

// Mocks de módulos do Electron/store antes de importar
vi.mock("electron", () => ({ app: { getPath: () => "/tmp" } }));
vi.mock("@mods/services/mod-storage-service", () => ({
  ModStorageService: { get: () => undefined, put: () => {} },
}));
vi.mock("@main/services/logger", () => ({ logger: { info: () => {}, warn: () => {} } }));

import { parseRequirements, checkCompatibility, lscpuMaxMhz, type SystemSpecs } from "./system-specs";

const RDR2_MIN =
  "Minimum:Requires a 64-bit processor and operating systemOS: Windows 10 - 64-bitProcessor: Intel® Core™ i5-2500K / AMD FX-6300Memory: 8 GB RAMGraphics: Nvidia GeForce GTX 770 2GB / AMD Radeon R9 280 3GBNetwork: Broadband Internet connectionStorage: 150 GB available spaceSound Card: Direct X Compatibl";

const RDR2_REC =
  "Recommended:Requires a 64-bit processor and operating systemOS: Windows 10 - 64-bitProcessor: Intel® Core™ i7-4770K / AMD Ryzen 5 1500XMemory: 12 GB RAMGraphics: Nvidia GeForce GTX 1060 6GB / AMD Radeon RX 480 4GBNetwork: Broadband Internet connectionStorage: 150 GB available spaceSound Card: Direct";

const SCHEDULE_MIN =
  "Minimum:Requires a 64-bit processor and operating systemOS: Windows 10 (64-bit)Processor: 3GHz 4-Core or similarMemory: 8 GB RAMGraphics: GeForce GTX 1060 or Radeon RX 580Storage: 8 GB available space";

const baseSpecs: SystemSpecs = {
  collectedAt: 0,
  cpu: { model: "AMD Ryzen 9 7950X", cores: 16, baseClockGhz: 4.5 },
  memory: { totalBytes: 0, totalGb: 32 },
  gpu: { name: "NVIDIA GeForce RTX 3060", vendor: "nvidia", vramMb: 12288 },
  os: { platform: "linux", release: "6.10" },
};

// Hardware REAL do usuário (coletado pelo app em /home/cas/.config/makai-forger/mods-store.json)
// NOTA: baseClockGhz=1.2 é o valor REAL gravado — o os.cpus()[0].speed reportou o
// clock IDLE (1.2GHz) em vez do clock base/turbo do Xeon E5-2698 v3 (2.3/3.6GHz).
const USER_SPECS: SystemSpecs = {
  collectedAt: 0,
  cpu: {
    model: "Intel(R) Xeon(R) CPU E5-2698 v3 @ 2.30GHz",
    cores: 64,
    baseClockGhz: 1.2, // bug real: clock idle gravado pelo os.cpus()
  },
  memory: { totalBytes: 0, totalGb: 70.6 },
  gpu: { name: "NVIDIA GeForce RTX 3060", vendor: "nvidia", vramMb: 12288 },
  os: { platform: "linux", release: "7.1.8-zen" },
};

// Textos REAIS do catalogo.db (Steam)
const L4D_MIN =
  "Minimum: Supported OS: Windows® 7 32/64-bit / Vista 32/64 / XP Processor: Pentium 4 3.0GHz Memory: 1 GB Graphics: 128 MB, Shader model 2.0, ATI 9600, NVidia 6600 or better Hard Drive: At least 7.5 GB of free space Sound Card: DirectX 9.0c compatible sound card";
const L4D_REC =
  "Recommended: Supported OS: Windows® 7 32/64-bit / Vista 32/64 / XP Processor: Intel core 2 duo 2.4GHz Memory: 1 GB Graphics: Shader model 3.0, NVidia 7600, ATI X1600 or better";
const PALWORLD_MIN =
  "Minimum:Requires a 64-bit processor and operating systemOS: Windows 10 or later (64-Bit)Processor: i5-3570K 3.4 GHz 4 CoreMemory: 16 GB RAMGraphics: GeForce GTX 1050 (2GB)DirectX: Version 11Network: Broadband Internet connectionStorage: 40 GB available spaceAdditional Notes: Internet connection required for multiplayer. SSD required.";
const PALWORLD_REC =
  "Recommended:Requires a 64-bit processor and operating systemOS: Windows 10 or later (64-Bit)Processor: i9-9900K 3.6 GHz 8 CoreMemory: 32 GB RAMGraphics: GeForce RTX 2070DirectX: Version 11Network: Broadband Internet connectionStorage: 40 GB available spaceAdditional Notes: Internet connection required for multiplayer. SSD required.";

describe("parseRequirements", () => {
  it("extrai CPU, RAM, GPU e storage do formato Steam", () => {
    const p = parseRequirements(RDR2_MIN);
    expect(p.ramGb).toBe(8);
    expect(p.storageGb).toBe(150);
    expect(p.cpu).toContain("i5-2500K");
    expect(p.gpu).toContain("GTX 770");
  });

  it("retorna vazio sem texto", () => {
    expect(parseRequirements(null)).toEqual({});
    expect(parseRequirements(undefined)).toEqual({});
    expect(parseRequirements("")).toEqual({});
  });

  it("não engole os campos seguintes (texto Steam sem quebras de linha)", () => {
    const p = parseRequirements(L4D_MIN);
    expect(p.cpu).toBe("Pentium 4 3.0GHz");
    expect(p.cpu).not.toContain("Memory");
    expect(p.gpu).toContain("NVidia 6600");
    expect(p.gpu).not.toContain("DirectX");
    expect(p.ramGb).toBe(1);
  });
});

describe("lscpuMaxMhz", () => {
  it("locale EN (CPU max MHz)", () => {
    expect(lscpuMaxMhz("CPU max MHz: 3600.0000\nCPU min MHz: 1200")).toBe(3.6);
  });

  it("locale PT-BR com vírgula decimal (CPU MHz máx.)", () => {
    expect(lscpuMaxMhz("CPU MHz máx.: 3600,0000\nCPU MHz mín.: 1200,0000")).toBe(3.6);
  });

  it("sem lscpu → 0", () => {
    expect(lscpuMaxMhz("")).toBe(0);
    expect(lscpuMaxMhz("nada aqui")).toBe(0);
  });
});

describe("checkCompatibility", () => {
  it("RDR2 mínimo → ok em hardware forte (RTX 3060, 32GB)", () => {
    const r = checkCompatibility(baseSpecs, RDR2_MIN, RDR2_REC);
    expect(r.level).toBe("ok");
    expect(r.below).toHaveLength(0);
  });

  it("Schedule I mínimo → ok (RTX 3060 ≥ GTX 1060)", () => {
    const r = checkCompatibility(baseSpecs, SCHEDULE_MIN, null);
    expect(r.level).toBe("ok");
  });

  it("RAM insuficiente → no", () => {
    const weak: SystemSpecs = {
      ...baseSpecs,
      memory: { totalBytes: 0, totalGb: 4 },
    };
    const r = checkCompatibility(weak, RDR2_MIN, RDR2_REC);
    expect(r.level).toBe("no");
    expect(r.below.some((b) => b.includes("RAM"))).toBe(true);
  });

  it("GPU inferior (GTX 760 vs mínimo GTX 770) → no", () => {
    const weak: SystemSpecs = {
      ...baseSpecs,
      gpu: { name: "NVIDIA GeForce GTX 760", vendor: "nvidia", vramMb: 2048 },
    };
    const r = checkCompatibility(weak, RDR2_MIN, RDR2_REC);
    expect(r.level).toBe("no");
  });

  it("sem requisitos → unknown", () => {
    const r = checkCompatibility(baseSpecs, null, null);
    expect(r.level).toBe("unknown");
  });

  it("REGRESSÃO: Left 4 Dead (catálogo real) → ok no hardware real do usuário", () => {
    const r = checkCompatibility(USER_SPECS, L4D_MIN, L4D_REC);
    expect(r.level).toBe("ok");
    expect(r.below).toHaveLength(0);
  });

  it("REGRESSÃO: Palworld (catálogo real) → ok no hardware real do usuário", () => {
    const r = checkCompatibility(USER_SPECS, PALWORLD_MIN, PALWORLD_REC);
    expect(r.level).toBe("ok");
    expect(r.below).toHaveLength(0);
  });
});

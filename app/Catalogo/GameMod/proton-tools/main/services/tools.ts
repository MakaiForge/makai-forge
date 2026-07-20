import { logger } from "@main/services/logger";
import type { ProtonTool } from "./types";

export const PROTON_TOOLS: ProtonTool[] = [
  {
    id: "valve",
    title: "Valve Proton",
    description:
      "Official Steam compatibility tool by Valve",
    category: "proton",
    endpoint:
      "https://api.github.com/repos/ValveSoftware/Proton/releases",
    assetPosition: 0,
    directoryNameFormat: "proton-$version",
    supportLatest: true,
    type: "github",
    preferTarball: true,
    extra: {
      githubUrl: "https://github.com/ValveSoftware/Proton",
      author: "Valve",
      license: "Proprietary",
      features: ["Steam Play", "Official Valve support", "Wide game compatibility"],
    },
  },
  {
    id: "proton-ge",
    title: "Proton-GE",
    description:
      "Steam compatibility tool by Valve + GloriousEggroll improvements",
    category: "proton",
    endpoint:
      "https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases",
    assetPosition: 1,
    directoryNameFormat: "GE-Proton-$version",
    supportLatest: true,
    type: "github",
    extra: {
      githubUrl: "https://github.com/GloriousEggroll/proton-ge-custom",
      author: "GloriousEggroll",
      license: "MIT",
      features: ["FSR support", "GameMode integration", "Vulkan improvements", "Latest Wine", "ProtonGE-specific fixes"],
    },
  },
  {
    id: "proton-cachyos",
    title: "Proton-CachyOS",
    description: "Steam compatibility tool from CachyOS Linux",
    category: "proton",
    endpoint: "https://api.github.com/repos/CachyOS/proton-cachyos/releases",
    assetPosition: 3,
    directoryNameFormat: "Proton-CachyOS-$version",
    supportLatest: true,
    type: "github",
    extra: {
      githubUrl: "https://github.com/CachyOS/proton-cachyos",
      author: "CachyOS Team",
      license: "GPL-2.0",
      features: ["Bolsacompiler optimizations", "FSR support", "GameMode ready"],
    },
  },
  {
    id: "dw-proton",
    title: "DW-Proton",
    description: "Dawn Winery's custom Proton fork with game fixes",
    category: "proton",
    endpoint: "https://dawn.wine/api/v1/repos/dawn-winery/dwproton/releases",
    assetPosition: 1,
    directoryNameFormat: "DW-Proton-$version",
    supportLatest: true,
    type: "forgejo",
    extra: {
      githubUrl: "https://dawn.wine/dawn-winery/dwproton",
      author: "Dawn Winery",
      license: "GPL-2.0",
      features: ["EAC bypass improvements", "Anti-cheat optimizations", "Specific game fixes"],
    },
  },
  {
    id: "proton-em",
    title: "Proton-EM",
    description: "Proton with FSR4 support and wine wayland tweaks",
    category: "proton",
    endpoint: "https://api.github.com/repos/Etaash-mathamsetty/Proton/releases",
    assetPosition: 1,
    directoryNameFormat: "Proton-EM-$version",
    supportLatest: true,
    type: "github",
    extra: {
      githubUrl: "https://github.com/Etaash-mathamsetty/Proton",
      author: "Etaash",
      license: "GPL-2.0",
      features: ["FSR4 support", "Wayland improvements", "Wine tweaks"],
    },
  },
  {
    id: "proton-ge-rtsp",
    title: "Proton-GE RTSP",
    description: "Proton-GE with RTSP codec improvements for VRChat",
    category: "proton",
    endpoint:
      "https://api.github.com/repos/SpookySkeletons/proton-ge-rtsp/releases",
    assetPosition: 1,
    directoryNameFormat: "Proton-GE-RTSP-$version",
    supportLatest: true,
    type: "github",
    extra: {
      githubUrl: "https://github.com/SpookySkeletons/proton-ge-rtsp",
      author: "SpookySkeletons",
      license: "MIT",
      features: ["RTSP codec support", "VRChat optimizations"],
    },
  },
  {
    id: "proton-tkg",
    title: "Proton-Tkg",
    description: "Custom Proton build based on Wine-tkg",
    category: "proton",
    endpoint:
      "https://api.github.com/repos/Frogging-Family/wine-tkg-git/actions/workflows/29873769/runs",
    assetPosition: 0,
    directoryNameFormat: "proton-tkg-$version",
    supportLatest: true,
    type: "github-action",
    extra: {
      githubUrl: "https://github.com/Frogging-Family/wine-tkg-git",
      author: "Frogging-Family",
      license: "GPL-2.0",
      features: ["Custom patches", "TKG configurations"],
    },
  },
  {
    id: "luxtorpeda",
    title: "Luxtorpeda",
    description: "Linux-native game engines for Windows-only games",
    category: "proton",
    endpoint: "https://api.github.com/repos/luxtorpeda-dev/luxtorpeda/releases",
    assetPosition: 0,
    directoryNameFormat: "luxtorpeda-$version",
    supportLatest: true,
    type: "github",
    extra: {
      githubUrl: "https://github.com/luxtorpeda-dev/luxtorpeda",
      author: "Luxtorpeda Team",
      license: "MIT",
      features: ["Native game engines", "DOSBox support"],
    },
  },
  {
    id: "roberta",
    title: "Roberta",
    description: "ScummVM adapter for adventure games",
    category: "proton",
    endpoint: "https://api.github.com/repos/dreamer/roberta/releases",
    assetPosition: 0,
    directoryNameFormat: "roberta-$version",
    supportLatest: true,
    type: "github",
  },
  {
    id: "boxtron",
    title: "Boxtron",
    description: "DOSBox adapter for DOS games",
    category: "proton",
    endpoint: "https://api.github.com/repos/dreamer/boxtron/releases",
    assetPosition: 0,
    directoryNameFormat: "boxtron-$version",
    supportLatest: true,
    type: "github",
  },
  {
    id: "steam-tinker-launch",
    title: "Steam Tinker Launch",
    description: "Launcher for customizing Steam games",
    category: "proton",
    endpoint: "https://api.github.com/rolfreeser/steam-tinker-launch/releases",
    assetPosition: 0,
    directoryNameFormat: "steam-tinker-launch-$version",
    supportLatest: true,
    type: "github",
  },
  {
    id: "wine-vanilla",
    title: "Wine-Vanilla (Kron4ek)",
    description: "Wine build from official WineHQ",
    category: "wine",
    endpoint: "https://api.github.com/repos/Kron4ek/Wine-Builds/releases",
    assetPosition: 2,
    directoryNameFormat: "wine-$version-amd64",
    supportLatest: false,
    type: "github",
    requestAssetExclude: ["proton", ".0."],
  },
  {
    id: "wine-staging",
    title: "Wine-Staging (Kron4ek)",
    description: "Wine with Staging patchset",
    category: "wine",
    endpoint: "https://api.github.com/repos/Kron4ek/Wine-Builds/releases",
    assetPosition: 4,
    directoryNameFormat: "wine-$version-staging-amd64",
    supportLatest: false,
    type: "github",
    requestAssetExclude: ["proton", ".0."],
  },
  {
    id: "wine-staging-tkg",
    title: "Wine-Staging-Tkg (Kron4ek)",
    description: "Wine with Staging + many useful patches",
    category: "wine",
    endpoint: "https://api.github.com/repos/Kron4ek/Wine-Builds/releases",
    assetPosition: 6,
    directoryNameFormat: "wine-$version-staging-tkg-amd64",
    supportLatest: false,
    type: "github",
    requestAssetExclude: ["proton", ".0."],
  },
  {
    id: "dxvk",
    title: "DXVK (doitsujin)",
    description: "Vulkan-based Direct3D implementation",
    category: "dxvk",
    endpoint: "https://api.github.com/repos/doitsujin/dxvk/releases",
    assetPosition: 0,
    directoryNameFormat: "dxvk-$version",
    supportLatest: true,
    type: "github",
  },
  {
    id: "dxvk-gplasync",
    title: "DXVK GPL+Async (Ph42oN)",
    description: "DXVK with gplasync patch",
    category: "dxvk",
    endpoint:
      "https://gitlab.com/api/v4/projects/Ph42oN%2Fdxvk-gplasync/releases",
    assetPosition: 0,
    directoryNameFormat: "dxvk-gplasync-$version",
    supportLatest: true,
    type: "gitlab",
  },
  {
    id: "vkd3d-proton",
    title: "VKD3D-Proton",
    description: "Direct3D 12 on Vulkan",
    category: "vkd3d",
    endpoint:
      "https://api.github.com/repos/HansKristian-Work/vkd3d-proton/releases",
    assetPosition: 0,
    directoryNameFormat: "vkd3d-proton-$version",
    supportLatest: true,
    type: "github",
  },
  {
    id: "proton-sarek",
    title: "Proton-Sarek",
    description: "Proton fork with Sarek patches for improved gaming performance",
    category: "proton",
    endpoint: "https://api.github.com/repos/pythonlover02/Proton-Sarek/releases",
    assetPosition: 1,
    directoryNameFormat: "Proton-Sarek-$version",
    supportLatest: true,
    type: "github",
    extra: {
      githubUrl: "https://github.com/pythonlover02/Proton-Sarek",
      author: "pythonlover02",
      license: "GPL-2.0",
      features: ["Sarek patches", "Async support", "Performance optimizations"],
    },
  },
  {
    id: "umu-proton",
    title: "UMU-Proton",
    description: "Proton build used by UMU-Launcher for non-Steam games",
    category: "proton",
    endpoint: "https://api.github.com/repos/Open-Wine-Components/umu-proton/releases",
    assetPosition: 1,
    directoryNameFormat: "UMU-Proton-$version",
    supportLatest: true,
    type: "github",
    extra: {
      githubUrl: "https://github.com/Open-Wine-Components/umu-proton",
      author: "Open-Wine-Components",
      license: "GPL-2.0",
      features: ["UMU-Launcher support", "Non-Steam game focus"],
    },
  },
  {
    id: "proton-plop",
    title: "Proton-Plop (loathingKernel)",
    description: "Community Proton fork with various optimizations and EM nightly builds",
    category: "proton",
    endpoint: "https://api.github.com/repos/loathingKernel/Proton/releases",
    assetPosition: 3,
    directoryNameFormat: "Proton-$version",
    supportLatest: true,
    type: "github",
    extra: {
      githubUrl: "https://github.com/loathingKernel/Proton",
      author: "loathingKernel",
      license: "GPL-2.0",
      features: ["EM nightly builds", "Plop releases", "Various optimizations"],
    },
  },
  {
    id: "proton-lina",
    title: "Proton-Lina (hoshinolina)",
    description: "Proton-GE based fork with additional game fixes by hoshinolina",
    category: "proton",
    endpoint: "https://api.github.com/repos/hoshinolina/Proton/releases",
    assetPosition: 1,
    directoryNameFormat: "GE-Proton-$version",
    supportLatest: true,
    type: "github",
    extra: {
      githubUrl: "https://github.com/hoshinolina/Proton",
      author: "hoshinolina",
      license: "MIT",
      features: ["Game fixes", "GE base"],
    },
  },
  {
    id: "proton-lfx2",
    title: "Proton-LFX2",
    description: "Proton fork with LFX2 patches for specific game compatibility",
    category: "proton",
    endpoint: "https://api.github.com/repos/FakeMichau/Proton-LFX2/releases",
    assetPosition: 0,
    directoryNameFormat: "Proton-LFX2-$version",
    supportLatest: false,
    type: "github",
    extra: {
      githubUrl: "https://github.com/FakeMichau/Proton-LFX2",
      author: "FakeMichau",
      license: "GPL-2.0",
      features: ["LFX2 patches", "Specific game compatibility"],
    },
  },
  {
    id: "proton-speedhack",
    title: "Proton-SpeedHack",
    description: "Proton with speed hack capabilities for older games",
    category: "proton",
    endpoint: "https://api.github.com/repos/LtSquigs/Proton-SpeedHack/releases",
    assetPosition: 0,
    directoryNameFormat: "proton-speedhack-$version",
    supportLatest: false,
    type: "github",
    extra: {
      githubUrl: "https://github.com/LtSquigs/Proton-SpeedHack",
      author: "LtSquigs",
      license: "GPL-2.0",
      features: ["Speed hack", "Older game focus"],
    },
  },
];

export function getTools(): ProtonTool[] {
  return PROTON_TOOLS;
}

export function getToolById(id: string): ProtonTool | undefined {
  return PROTON_TOOLS.find((t) => t.id === id);
}

export function getToolsByCategory(category: string): ProtonTool[] {
  return PROTON_TOOLS.filter((t) => t.category === category);
}

const FORK_FORK_TO_TOOL_ID: Record<string, string> = {
  "ge-proton": "proton-ge",
  "dw-proton": "dw-proton",
  "proton-cachyos": "proton-cachyos",
  "proton-em": "proton-em",
  "proton-ge-rtsp": "proton-ge-rtsp",
  "proton-tkg": "proton-tkg",
  "luxtorpeda": "luxtorpeda",
  "roberta": "roberta",
  "boxtron": "boxtron",
  "steam-tinker-launch": "steam-tinker-launch",
  "umu-proton": "umu-proton",
  "proton-sarek": "proton-sarek",
  "proton-plop": "proton-plop",
  "proton-lina": "proton-lina",
  "proton-lfx2": "proton-lfx2",
  "proton-speedhack": "proton-speedhack",
  "valve": "valve",
  "proton-experimental": "valve",
  "proton-hotfix": "valve",
};

export function findToolIdByForkName(fork: { fork?: string; name: string }): string | undefined {
  if (fork.fork) {
    const mapped = FORK_FORK_TO_TOOL_ID[fork.fork];
    if (mapped) {
      logger.info(`[findToolId] mapeado por fork.fork: "${fork.fork}" → "${mapped}"`);
      return mapped;
    }
    const direct = PROTON_TOOLS.find((t) => t.id === fork.fork);
    if (direct) {
      logger.info(`[findToolId] match direto por fork.fork: "${fork.fork}" → "${direct.id}"`);
      return direct.id;
    }
  }

  const name = fork.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  logger.info(`[findToolId] name limpo="${name}" (fork.name="${fork.name}")`);
  for (const tool of PROTON_TOOLS) {
    const formatDir = tool.directoryNameFormat
      .replace("$version", "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (formatDir.length < 3) continue; // skip too-short prefixes (e.g. "proton")
    const match = name.includes(formatDir);
    logger.info(`[findToolId]   testando tool.id="${tool.id}" formatDirClean="${formatDir}" match=${match}`);
    if (match) {
      return tool.id;
    }
  }
  logger.info(`[findToolId] NENHUM match encontrado para fork.name="${fork.name}"`);
  return undefined;
}

export function formatDirName(tool: ProtonTool, version: string): string {
  const ver = version.replace(/^v/, "");

  const fmtPrefixOriginal = tool.directoryNameFormat.replace("$version", "");

  // Se a versão já começa com o prefixo do formato (ignorando traço final), retorna direto
  const fmtPrefixNoDash = fmtPrefixOriginal.replace(/[-_\s]+$/, "");
  if (ver.toLowerCase().startsWith(fmtPrefixNoDash.toLowerCase())) {
    return ver;
  }

  const verLower = ver.replace(/[-_\s]/g, "-").toLowerCase();

  const knownPrefixes = [
    "proton-ge-", "ge-proton-",
    "proton-em-", "em-",
    "dwproton-", "dw-proton-",
    "proton-cachyos-", "cachyos-",
    "proton-tkg-", "tkg-",
  ];
  for (const prefix of knownPrefixes) {
    if (verLower.startsWith(prefix)) {
      const rest = ver.slice(prefix.length);
      return fmtPrefixOriginal + rest;
    }
  }

  return tool.directoryNameFormat.replace("$version", ver);
}

export function findToolByFolder(folderName: string): ProtonTool | undefined {
  const folderLower = folderName.toLowerCase();

  const entries = PROTON_TOOLS
    .map(tool => {
      const prefix = tool.directoryNameFormat
        .replace("$version", "")
        .replace(/[-_\s]+$/, "")
        .toLowerCase();
      return { tool, prefix, id: tool.id.toLowerCase() };
    })
    .sort((a, b) => {
      const lenDiff = b.prefix.length - a.prefix.length;
      if (lenDiff !== 0) return lenDiff;
      const aMatch = folderLower.includes(a.id) ? 1 : 0;
      const bMatch = folderLower.includes(b.id) ? 1 : 0;
      return bMatch - aMatch;
    });

  for (const { tool, prefix } of entries) {
    if (prefix.length > 0 && folderLower.startsWith(prefix)) {
      return tool;
    }
    if (prefix.length > 0) {
      const prefixNoHyphen = prefix.replace(/-/g, "");
      const folderNoHyphen = folderLower.replace(/-/g, "");
      if (prefixNoHyphen.length > 0 && folderNoHyphen.startsWith(prefixNoHyphen)) {
        return tool;
      }
    }
  }

  return undefined;
}

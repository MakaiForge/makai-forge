import { TIER_COLORS, TIER_BG_COLORS, CONFIDENCE_LABELS } from "./constants";

export const getTierColor = (tier: string) =>
  TIER_COLORS[tier.toLowerCase()] || "#888";

export const getTierBg = (tier: string) =>
  TIER_BG_COLORS[tier.toLowerCase()] || "transparent";

export const getConfidenceDisplay = (confidence: string) => {
  const entry = CONFIDENCE_LABELS[confidence.toLowerCase()];
  return entry || { label: confidence, color: "#888" };
};

export const detectForkId = (version: string): string => {
  const v = version.toLowerCase();
  if (v.startsWith("ge-proton") || v.startsWith("proton-ge")) return "ge-proton";
  if (v.includes("experimental")) return "proton-experimental";
  if (v.includes("hotfix")) return "proton-hotfix";
  if (v.startsWith("proton-tkg") || v.includes("tkg")) return "proton-tkg";
  if (v.includes("cachyos")) return "proton-cachyos";
  if (v.includes("dw-proton")) return "dw-proton";
  return "valve";
};

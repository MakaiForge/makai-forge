export const TIER_COLORS: Record<string, string> = {
  gold: "#FFD700",
  silver: "#C0C0C0",
  bronze: "#CD7F32",
  platinum: "#E5E4E2",
};

export const TIER_BG_COLORS: Record<string, string> = {
  gold: "rgba(255, 215, 0, 0.15)",
  silver: "rgba(192, 192, 192, 0.15)",
  bronze: "rgba(205, 127, 50, 0.15)",
  platinum: "rgba(229, 228, 226, 0.15)",
};

export const CONFIDENCE_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: "Alta", color: "#27ae60" },
  medium: { label: "Média", color: "#f39c12" },
  low: { label: "Baixa", color: "#e74c3c" },
  genérico: { label: "Palpite (tierScore)", color: "#888" },
};

export const FORK_ALIAS: Record<string, string> = {
  "ge-proton": "proton-ge",
};

export const PROTON_TO_FORK_ID: Record<string, string> = {
  "proton-ge": "ge-proton",
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

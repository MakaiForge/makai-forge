import type { CatalogueSearchPayload } from "@types";

export type FilterKey = keyof Pick<
  CatalogueSearchPayload,
  | "genres"
  | "tags"
  | "downloadSourceFingerprints"
  | "developers"
  | "publishers"
>;

export const PAGE_SIZE = 20;

export const CURATED_GENRES = [
  "Action",
  "Adventure",
  "Arcade",
  "Casual",
  "Fighting",
  "Indie",
  "Massively Multiplayer",
  "Puzzle",
  "RPG",
  "Racing",
  "Shooter",
  "Simulation",
  "Sports",
  "Strategy",
  "Visual Novel",
];

export const filterCategoryColors: Record<FilterKey, string> = {
  genres: "hsl(262deg 50% 47%)",
  tags: "hsl(95deg 50% 20%)",
  downloadSourceFingerprints: "hsl(27deg 50% 40%)",
  developers: "hsl(340deg 50% 46%)",
  publishers: "hsl(200deg 50% 30%)",
};

export const clearAllCategoryFilters = {
  genres: [],
  tags: [],
  downloadSourceFingerprints: [],
  developers: [],
  publishers: [],
};

export interface GroupedFilter {
  label: string;
  filterType: string;
  orbColor: string;
  key: FilterKey;
  value: string;
}

export interface FilterSectionItem {
  label: string;
  value: string | number;
  checked: boolean;
}

export interface FilterSectionData {
  title: string;
  items: FilterSectionItem[];
  key: string;
}

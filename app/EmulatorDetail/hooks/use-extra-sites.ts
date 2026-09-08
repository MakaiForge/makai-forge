import { useState, useCallback } from "react";
import type { RomSite } from "@emulators/types";

const STORAGE_KEY = "emulator-extra-sites";

function loadAll(): Record<string, RomSite[]> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveAll(data: Record<string, RomSite[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function useExtraSites(runnerId: string | undefined) {
  const [extraSites, setExtraSites] = useState<Record<string, RomSite[]>>(loadAll);
  const [showModal, setShowModal] = useState(false);

  const getSites = useCallback(
    (defaultSites: RomSite[]): RomSite[] => {
      if (!runnerId) return defaultSites;
      const extra = extraSites[runnerId] || [];
      return [...defaultSites, ...extra];
    },
    [runnerId, extraSites]
  );

  const openAddModal = useCallback(() => setShowModal(true), []);
  const closeAddModal = useCallback(() => setShowModal(false), []);

  const addSite = useCallback(
    (name: string, url: string, imageUrl?: string) => {
      if (!runnerId) return;
      const updated = { ...extraSites };
      if (!updated[runnerId]) updated[runnerId] = [];
      updated[runnerId] = [...updated[runnerId], { name, url, imageUrl }];
      setExtraSites(updated);
      saveAll(updated);
      setShowModal(false);
    },
    [runnerId, extraSites]
  );

  return { getSites, addSite, openAddModal, closeAddModal, showModal };
}

import { useEffect } from "react";

interface ShortcutDeps {
  selectedModIdx: number | null;
  filteredMods: { name: string }[];
  onSearchFocus: () => void;
  onDeploy: () => void;
  onRemoveMod: (name: string) => void;
  onDeselect: () => void;
}

export function useModManagerShortcuts({
  selectedModIdx, filteredMods, onSearchFocus, onDeploy, onRemoveMod, onDeselect,
}: ShortcutDeps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        onSearchFocus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        onDeploy();
      }
      if (e.key === "Delete" && selectedModIdx !== null) {
        e.preventDefault();
        const mod = filteredMods[selectedModIdx];
        if (mod && window.confirm(`Remove "${mod.name}" from modlist?`)) {
          onRemoveMod(mod.name);
          onDeselect();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedModIdx, filteredMods, onSearchFocus, onDeploy, onRemoveMod, onDeselect]);
}

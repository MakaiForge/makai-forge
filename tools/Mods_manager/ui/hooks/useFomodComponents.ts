import { useState, useCallback, useEffect, useMemo } from "react";
import type { FomodComponent } from "@types";
import type { ModlistEntry } from "../../types/mod.types";
import type { ConflictDetails } from "./mods/useConflictBadges";
import { normalizeToDeployPath } from "./mods/useConflictBadges";

interface UseFomodComponentsOpts {
  selectedMod: ModlistEntry | null;
  selectedGame: string | null;
  addLog: (msg: string) => void;
  setActiveRightTab: (tab: string) => void;
  allConflicts: ConflictDetails | null;
}

export function useFomodComponents({
  selectedMod,
  selectedGame,
  addLog,
  setActiveRightTab,
  allConflicts,
}: UseFomodComponentsOpts) {
  const [fomodComponents, setFomodComponents] = useState<FomodComponent[]>([]);

  // Load FOMOD components when selected mod changes + auto-switch to FOMOD tab
  useEffect(() => {
    if (!selectedMod || !selectedGame) {
      setFomodComponents([]);
      return;
    }
    if (!selectedMod.hasFomod) {
      setFomodComponents([]);
      return;
    }
    (async () => {
      try {
        let components = await window.electron.modsStore.get(`game:${selectedGame}:mod:${selectedMod.name}:fomodComponents`);
        if (Array.isArray(components) && components.length > 0) {
          setFomodComponents(components);
          setActiveRightTab("fomod");
          return;
        }
        if (selectedMod.stagingDir) {
          const captured = await window.electron.captureFomodComponents(selectedMod.stagingDir);
          if (captured && captured.length > 0) {
            await window.electron.modsStore.put(`game:${selectedGame}:mod:${selectedMod.name}:fomodComponents`, captured);
            setFomodComponents(captured);
            setActiveRightTab("fomod");
            addLog(`Captured ${captured.length} FOMOD component(s) for ${selectedMod.name}`);
            return;
          }
        }
        setFomodComponents([]);
      } catch (err) {
        console.error("[FOMOD] capture error:", err);
        setFomodComponents([]);
      }
    })();
  }, [selectedMod, selectedGame]);

  // Compute FOMOD component conflicts using normalized deploy paths
  const fomodConflicts = useMemo(() => {
    if (!selectedMod || fomodComponents.length === 0 || allConflicts?.conflicts?.length === 0) return [];
    const modConflicts = allConflicts?.conflicts?.filter(c =>
      c.mods.some(m => m.name === selectedMod.name)
    );
    if (!modConflicts || modConflicts.length === 0) return [];

    const result: { modName: string; files: string[] }[] = [];

    for (const conflict of modConflicts) {
      const otherMod = conflict.mods.find(m => m.name !== selectedMod.name);
      if (!otherMod) continue;

      const conflictNorm = conflict.relativePath;
      const matchingComponentFiles: string[] = [];

      for (const component of fomodComponents) {
        for (const file of component.files) {
          const fileNorm = normalizeToDeployPath(file.toLowerCase());
          if (fileNorm === conflictNorm) {
            matchingComponentFiles.push(file);
          }
        }
      }

      if (matchingComponentFiles.length > 0) {
        let existing = result.find(r => r.modName === otherMod.name);
        if (existing) {
          for (const f of matchingComponentFiles) {
            if (!existing.files.includes(f)) existing.files.push(f);
          }
        } else {
          result.push({ modName: otherMod.name, files: matchingComponentFiles });
        }
      }
    }
    return result;
  }, [selectedMod, fomodComponents, allConflicts]);

  const handleToggleFomodComponent = useCallback(async (componentName: string) => {
    if (!selectedMod || !selectedGame) return;
    const component = fomodComponents.find(c => c.name === componentName);
    if (!component) return;

    const newEnabled = !component.enabled;
    const newComponents = fomodComponents.map(c =>
      c.name === componentName ? { ...c, enabled: newEnabled } : c
    );
    setFomodComponents(newComponents);

    await window.electron.modsStore.put(`game:${selectedGame}:mod:${selectedMod.name}:fomodComponents`, newComponents);

    if (selectedMod.stagingDir) {
      try {
        await window.electron.toggleFomodComponent(
          selectedMod.stagingDir,
          component.files,
          newEnabled,
          newEnabled ? component.sourceFiles : undefined,
        );
        addLog(`${newEnabled ? "Enabled" : "Disabled"} FOMOD component: ${componentName}`);
      } catch (err) {
        addLog(`Failed to toggle ${componentName}: ${err}`);
      }
    }
  }, [selectedMod, selectedGame, fomodComponents, addLog]);

  const handleDetectFomodComponents = useCallback(async () => {
    if (!selectedMod?.stagingDir || !selectedGame) return;
    try {
      const captured = await window.electron.captureFomodComponents(selectedMod.stagingDir);
      if (captured && captured.length > 0) {
        await window.electron.modsStore.put(`game:${selectedGame}:mod:${selectedMod.name}:fomodComponents`, captured);
        setFomodComponents(captured);
        addLog(`Detected ${captured.length} FOMOD component(s) for ${selectedMod.name}`);
      } else {
        addLog(`No FOMOD components found for ${selectedMod.name}`);
      }
    } catch (err) {
      console.error("[FOMOD] manual detect error:", err);
      addLog(`Error detecting FOMOD components: ${String(err)}`);
    }
  }, [selectedMod, selectedGame, addLog]);

  return {
    fomodComponents,
    setFomodComponents,
    fomodConflicts,
    handleToggleFomodComponent,
    handleDetectFomodComponents,
  };
}

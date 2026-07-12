import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { FomodConfig, FomodStep } from "../../types/fomod.types";

function flagsSatisfied(
  required: Record<string, string> | undefined,
  activeFlags: Record<string, string>,
): boolean {
  if (!required) return true;
  for (const [flag, value] of Object.entries(required)) {
    if (activeFlags[flag] !== value) return false;
  }
  return true;
}

function computeActiveFlags(
  steps: FomodStep[],
  selections: Record<string, string[]>,
): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const step of steps) {
    const stepSelections = selections[step.id] || selections[step.name] || [];
    for (const group of step.groups) {
      for (const plugin of group.plugins) {
        if (stepSelections.includes(plugin.name) && plugin.condition_flags) {
          Object.assign(flags, plugin.condition_flags);
        }
      }
    }
  }
  return flags;
}

export function useFomod(
  addLog: (msg: string) => void,
  onRefresh: () => void,
  gameId?: string,
  onModInstalled?: (modName: string) => void,
) {
  const [showFomod, setShowFomod] = useState(false);
  const [fomodDir, setFomodDir] = useState("");
  const [pendingModZip, setPendingModZip] = useState("");
  const [modName, setModName] = useState("");
  const [config, setConfig] = useState<FomodConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [installing, setInstalling] = useState(false);
  const parsedRef = useRef(false);

  const fomodSelectionsKey = useCallback((name: string) =>
    `game:${gameId}:fomod_selections:${name}`, [gameId]);

  // Compute active flags from current selections (forward propagation)
  const activeFlags = useMemo(() => {
    if (!config) return {};
    return computeActiveFlags(config.steps, selections);
  }, [config, selections]);

  // Filter steps whose visibility is satisfied by current flags
  const filteredSteps = useMemo(() => {
    if (!config) return [];
    const result: FomodStep[] = [];
    for (const step of config.steps) {
      if (!flagsSatisfied(step.visible, activeFlags)) continue;
      result.push(step);
    }
    return result;
  }, [config, activeFlags]);

  // Auto-adjust currentStep if filtered steps change
  useEffect(() => {
    if (filteredSteps.length === 0) {
      setCurrentStep(0);
      return;
    }
    setCurrentStep(s => Math.min(s, filteredSteps.length - 1));
  }, [filteredSteps.length]);

  const openFomod = useCallback((stagingDir: string, archivePath: string, name?: string) => {
    setFomodDir(stagingDir);
    setPendingModZip(archivePath);
    setModName(name || "");
    setShowFomod(true);
    setConfig(null);
    setLoading(true);
    setError(null);
    setCurrentStep(0);
    setSelections({});
    setInstalling(false);
    parsedRef.current = false;
  }, []);

  useEffect(() => {
    if (!showFomod || !fomodDir || parsedRef.current) return;
    parsedRef.current = true;

    (async () => {
      try {
        const cfg = await window.electron.parseFomod(fomodDir);
        if (cfg) {
          // Step id is always unique (set by parser as step-N),
          // so we can use it as the selection key.
          const parsed = cfg as unknown as FomodConfig;
          setConfig(parsed);

          // Load saved selections
          let savedSelections: Record<string, string[]> = {};
          if (modName && gameId) {
            try {
              const saved: unknown = await window.electron.modsStore.get(fomodSelectionsKey(modName));
              if (saved && typeof saved === "object") savedSelections = saved as Record<string, string[]>;
            } catch { /* ignore */ }
          }

          // Compute defaults for ALL steps (including ones that may be hidden later)
          const defaults: Record<string, string[]> = {};
          for (const step of parsed.steps || []) {
            const sel: string[] = [];
            for (const group of step.groups || []) {
              if (group.type === "SelectExactlyOne" || group.type === "SelectAtMostOne") {
                if (group.plugins?.[0]) sel.push(group.plugins[0].name);
              } else {
                for (const plugin of group.plugins || []) {
                  if (plugin.type === "Recommended" || plugin.type === "Required") {
                    sel.push(plugin.name);
                  }
                }
              }
            }
            defaults[step.id] = sel;
          }

          // Merge: use saved if step exists in saved, else default
          const merged: Record<string, string[]> = {};
          for (const stepId of Object.keys(defaults)) {
            merged[stepId] = savedSelections[stepId] || defaults[stepId];
          }
          setSelections(merged);
        } else {
          setError("Failed to parse FOMOD config");
        }
      } catch (err) {
        setError(String(err));
      }
      setLoading(false);
    })();
  }, [showFomod, fomodDir, modName, gameId, fomodSelectionsKey]);

  const handleTogglePlugin = useCallback((stepIndex: number, groupIndex: number, pluginIndex: number) => {
    if (!config) return;
    const step = filteredSteps[stepIndex];
    const group = step?.groups?.[groupIndex];
    const plugin = group?.plugins?.[pluginIndex];
    if (!step || !group || !plugin) return;

    const key = step.id;
    setSelections(prev => {
      const current = [...(prev[key] || [])];
      const idx = current.indexOf(plugin.name);

      if (idx >= 0) {
        current.splice(idx, 1);
      } else if (group.type === "SelectExactlyOne" || group.type === "SelectAtMostOne") {
        return { ...prev, [key]: [plugin.name] };
      } else {
        current.push(plugin.name);
      }
      return { ...prev, [key]: current };
    });
  }, [config, filteredSteps]);

  const handleNextStep = useCallback(() => {
    setCurrentStep(s => Math.min(s + 1, Math.max(filteredSteps.length - 1, 0)));
  }, [filteredSteps.length]);

  const handlePrevStep = useCallback(() => {
    setCurrentStep(s => Math.max(s - 1, 0));
  }, []);

  const handleInstall = useCallback(async () => {
    if (!config || !fomodDir) return;
    setInstalling(true);
    setError(null);
    addLog("Applying FOMOD selections...");
    try {
      const result = await window.electron.installFomod(fomodDir, fomodDir, selections);
      addLog(`FOMOD install complete: ${result.filesCopied} files`);
      // Save selections for future reinstalls
      if (modName && gameId) {
        await window.electron.modsStore.put(fomodSelectionsKey(modName), selections);
        addLog(`Saved FOMOD selections for ${modName}`);
      }
    } catch (err) {
      addLog(`FOMOD error: ${String(err)}`);
    }
    setInstalling(false);
    setShowFomod(false);
    await onRefresh();
    onModInstalled?.(modName);
  }, [config, fomodDir, selections, modName, gameId, fomodSelectionsKey, addLog, onRefresh, onModInstalled]);

  const handleFomodCancel = useCallback(async () => {
    setShowFomod(false);
    addLog("FOMOD installation cancelled");
    await onRefresh();
  }, [addLog, onRefresh]);

  const handleResetSelections = useCallback(async () => {
    if (!config || !fomodDir) return;
    // Delete saved selections from storage
    if (modName && gameId) {
      try {
        await window.electron.modsStore.put(fomodSelectionsKey(modName), null);
        addLog(`Reset FOMOD selections for ${modName}`);
      } catch { /* ignore */ }
    }
    // Recompute defaults
    const defaults: Record<string, string[]> = {};
    for (const step of config.steps || []) {
      const sel: string[] = [];
      for (const group of step.groups || []) {
        if (group.type === "SelectExactlyOne" || group.type === "SelectAtMostOne") {
          if (group.plugins?.[0]) sel.push(group.plugins[0].name);
        } else {
          for (const plugin of group.plugins || []) {
            if (plugin.type === "Recommended" || plugin.type === "Required") {
              sel.push(plugin.name);
            }
          }
        }
      }
      defaults[step.id] = sel;
    }
    setSelections(defaults);
    setCurrentStep(0);
  }, [config, fomodDir, modName, gameId, fomodSelectionsKey, addLog]);

  const handleInstallMod = useCallback(async (): Promise<string | null> => {
    try {
      const result = await window.electron.showOpenDialog({
        title: "Select Mod Archive",
        filters: [
          { name: "Mod Archives", extensions: ["zip", "7z", "rar", "fomod", "tar.gz"] },
          { name: "All Files", extensions: ["*"] },
        ],
        properties: ["openFile"],
      });
      if (result.canceled || !result.filePaths.length) return null;
      return result.filePaths[0];
    } catch { return null; }
  }, []);

  return {
    showFomod,
    fomodDir,
    pendingModZip,
    config,
    filteredSteps,
    loading,
    error,
    currentStep,
    installing,
    selections,
    openFomod,
    handleTogglePlugin,
    handleNextStep,
    handlePrevStep,
    handleInstall,
    handleFomodCancel,
    handleResetSelections,
    handleInstallMod,
  };
}

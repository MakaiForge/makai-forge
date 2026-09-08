import { useState, useCallback, useMemo } from "react";
import type { ProtonFork } from "@types";
import { FORK_ALIAS } from "./constants";
import { detectForkId } from "./helpers";
import { runConfirm } from "./confirm";
import type { DownloadProgress, SwitchResult } from "./types";

interface SelectionDeps {
  installedTools: any[];
  forkInfoMap: Record<string, any>;
  allForks: ProtonFork[];
  mode: "install" | "switch";
  onSelect: (protonPath: string) => void;
  onSwitchProton?: (
    protonPath: string
  ) => Promise<
    | {
        ok: boolean;
        data?: { savesRestored: number; dllsInstalled: string[] };
        error?: string;
      }
    | void
  >;
  onDownloadAndSelect?: (fork: ProtonFork) => Promise<void>;
}

export function useProtonSelection(deps: SelectionDeps) {
  const {
    installedTools,
    forkInfoMap,
    allForks,
    mode,
    onSelect,
    onSwitchProton,
    onDownloadAndSelect,
  } = deps;

  const [selectedFork, setSelectedFork] = useState<ProtonFork | null>(null);
  const [selectedVersion, setSelectedVersion] = useState("");
  const [selectedProton, setSelectedProton] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(
    null
  );
  const [switching, setSwitching] = useState(false);
  const [switchResult, setSwitchResult] = useState<SwitchResult | null>(null);

  const reset = useCallback(() => {
    setSelectedFork(null);
    setSelectedVersion("");
    setSelectedProton(null);
    setDownloadProgress(null);
    setSwitchResult(null);
    setSwitching(false);
    setIsDownloading(false);
  }, []);

  const selectedDisplayName = useMemo(() => {
    if (selectedFork) return selectedFork.name;
    if (!selectedProton) return null;
    const tool = installedTools.find((i: any) => i.path === selectedProton);
    return tool?.version || null;
  }, [selectedProton, selectedFork, installedTools]);

  const findInstalled = useCallback(
    (version: string): { path: string; version: string } | null => {
      const v = version.toLowerCase().replace(/^v/, "");
      for (const tool of installedTools) {
        const tVer = (tool.version || "").toLowerCase().replace(/^v/, "");
        if (tVer === v || tVer.includes(v) || v.includes(tVer)) {
          return { path: tool.path, version: tool.version };
        }
      }
      return null;
    },
    [installedTools]
  );

  const forkHasInstalledVersion = useCallback(
    (versions: string[]): boolean => versions.some((ver) => findInstalled(ver)),
    [findInstalled]
  );

  const handleSelectVersion = useCallback(
    (fork: ProtonFork, version: string, installedPath?: string) => {
      if (installedPath) {
        setSelectedProton(installedPath);
        setSelectedFork(null);
        setSelectedVersion(version);
        return;
      }
      const info = forkInfoMap[FORK_ALIAS[fork.fork] || fork.fork];
      if (info) {
        setSelectedFork({
          fork: fork.fork,
          name: info.name || fork.name,
          version,
          tier: info.ranking || fork.tier,
          tierScore: info.tierScore ?? fork.tierScore,
          confidence: "manual",
        });
        setSelectedProton(null);
        setSelectedVersion(version);
      } else {
        setSelectedFork({ ...fork, version, confidence: "manual" });
        setSelectedProton(null);
        setSelectedVersion(version);
      }
    },
    [forkInfoMap]
  );

  const handleSelectManual = useCallback((path: string, version: string) => {
    setSelectedProton(path);
    setSelectedFork(null);
    setSelectedVersion(version);
  }, []);

  const handleSelectRecommendedVersion = useCallback(
    (version: string) => {
      const installed = findInstalled(version);
      if (installed) {
        handleSelectManual(installed.path, installed.version);
        return;
      }
      const forkId = detectForkId(version);
      const forkName = forkInfoMap[forkId]?.name || forkId;
      const existing = allForks.find(
        (f) =>
          f.fork === forkId &&
          forkInfoMap[f.fork]?.versions?.some(
            (v: string) =>
              v === version || v.toLowerCase() === version.toLowerCase()
          )
      );
      if (existing) {
        handleSelectVersion(existing, version);
        return;
      }
      const targetFork: ProtonFork = {
        fork: forkId,
        name: forkName,
        version,
        tier: forkInfoMap[forkId]?.ranking || "gold",
        tierScore: forkInfoMap[forkId]?.tierScore || 80,
        confidence: "protondb",
      };
      handleSelectVersion(targetFork, version);
    },
    [allForks, forkInfoMap, handleSelectVersion, detectForkId, findInstalled, handleSelectManual]
  );

  const handleConfirm = useCallback(
    () =>
      runConfirm({
        selectedProton, selectedFork, mode, onSelect, onSwitchProton,
        onDownloadAndSelect, findInstalled, setSwitching, setSwitchResult,
        setIsDownloading, setDownloadProgress,
      }),
    [
      selectedProton, selectedFork, mode, onSelect, onSwitchProton,
      onDownloadAndSelect, findInstalled, setSwitching, setSwitchResult,
      setIsDownloading, setDownloadProgress,
    ]
  );

  return {
    selectedFork, selectedVersion, selectedProton, isDownloading,
    downloadProgress, switching, switchResult, selectedDisplayName,
    findInstalled, forkHasInstalledVersion, handleSelectVersion,
    handleSelectManual, handleSelectRecommendedVersion, handleConfirm,
    setSelectedFork, setSelectedProton, setSelectedVersion,
    setDownloadProgress, setSwitchResult, setIsDownloading, reset,
  };
}

import { useEffect, useState, useCallback } from "react";
import i18next from "i18next";
import { useReleases } from "./useReleases";
import * as api from "../services/proton-api";
import type { Tab, ToolInfo, InstalledTool, DownloadState } from "../types";

export type { Tab, ToolInfo, InstalledTool, DownloadState };

export function useProtonTools() {
  const [activeTab, setActiveTab] = useState<Tab>("tools");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [downloads, setDownloads] = useState<DownloadState[]>([]);
  const [installed, setInstalled] = useState<InstalledTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [infoTool, setInfoTool] = useState<ToolInfo | null>(null);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [selectedRelease, setSelectedRelease] = useState<any>(null);

  const { releases, loadReleases } = useReleases();

  useEffect(() => {
    const handleProgress = (e: Event) => {
      const progress = (e as CustomEvent).detail as {
        toolId: string;
        version: string;
        percent: number;
        speed: string;
      };
      setDownloads((prev) => {
        const idx = prev.findIndex((d) => d.toolId === progress.toolId && d.version === progress.version);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], percent: progress.percent, speed: progress.speed };
        return next;
      });
    };

    const handleComplete = (e: Event) => {
      const detail = (e as CustomEvent).detail as { toolId: string } | undefined;
      if (detail?.toolId) {
        setDownloads((prev) => prev.filter((d) => d.toolId !== detail.toolId));
      }
      loadInstalled();
    };

    window.addEventListener("proton-download-progress", handleProgress);
    window.addEventListener("proton-download-complete", handleComplete);
    return () => {
      window.removeEventListener("proton-download-progress", handleProgress);
      window.removeEventListener("proton-download-complete", handleComplete);
    };
  }, []);

  const loadInstalled = useCallback(async () => {
    try {
      const result = (await api.getInstalledProtonTools()) as InstalledTool[];
      setInstalled(result);
    } catch (e) {
      console.error("Failed to load installed:", e);
    }
  }, []);

  useEffect(() => {
    loadInstalled().then(() => setLoading(false));
  }, [loadInstalled]);

  useEffect(() => {
    if (activeTab === "tools" || activeTab === "installed") {
      loadInstalled();
    }
  }, [activeTab, loadInstalled]);

  useEffect(() => {
    const onFocus = () => loadInstalled();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadInstalled]);

  const handleSelectVersion = useCallback(
    (toolId: string, release: any) => {
      setSelectedToolId(toolId);
      if (release) {
        setSelectedVersion(release.tag_name);
        setSelectedRelease(release);
      } else {
        setSelectedVersion("");
        setSelectedRelease(null);
      }
      loadReleases(toolId);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [loadReleases]
  );

  const toggleExpand = useCallback(
    async (toolId: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(toolId)) {
          next.delete(toolId);
        } else {
          next.add(toolId);
          loadReleases(toolId);
        }
        return next;
      });
    },
    [loadReleases]
  );

  const isInstalled = useCallback(
    (toolId: string, version: string) => {
      if (!version) return false;
      const normalizedVersion = version.toLowerCase().replace(/^v/, "");
      return installed.some((i) => {
        if (i.tool.id !== toolId) return false;
        const installedVersion = i.version.toLowerCase();
        return (
          installedVersion.includes(normalizedVersion) ||
          normalizedVersion.includes(installedVersion)
        );
      });
    },
    [installed]
  );

  const handleDownload = useCallback(
    async (toolId: string, release: any) => {
      setDownloads((prev) => {
        if (prev.some(d => d.toolId === toolId && d.version === release.tag_name)) return prev;
        const item: DownloadState = {
          toolId,
          version: release.tag_name,
          percent: 0,
          speed: "queued",
        };
        return [...prev, item];
      });
      setActiveTab("downloads");
      try {
        await api.downloadProtonTool(toolId, release);
        await new Promise((r) => setTimeout(r, 500));
        await loadInstalled();
      } finally {
        setDownloads((prev) => prev.filter((d) => !(d.toolId === toolId && d.version === release.tag_name)));
      }
    },
    [loadInstalled]
  );

  const handleRemove = useCallback(
    async (toolId: string, toolPath: string) => {
      if (confirm(i18next.t("proton_tools:remove_confirm", { tool: toolId }))) {
        await api.removeProtonTool(toolId, toolPath);
        await loadInstalled();
      }
    },
    [loadInstalled]
  );

  const handleOpenFolder = useCallback(async (path: string) => {
    await api.showItemInFolder(path);
  }, []);

  return {
    activeTab,
    setActiveTab,
    expanded,
    downloads,
    installed,
    loading,
    infoTool,
    setInfoTool,
    releases,
    toggleExpand,
    isInstalled,
    handleDownload,
    handleRemove,
    handleOpenFolder,
    loadInstalled,
    selectedToolId,
    setSelectedToolId,
    selectedVersion,
    setSelectedVersion,
    setSelectedRelease,
    selectedRelease,
    handleSelectVersion,
  };
}

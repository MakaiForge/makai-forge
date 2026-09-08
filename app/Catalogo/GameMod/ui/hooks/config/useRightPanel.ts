import { useState, useEffect, useCallback } from "react";
import type { RightTab, FileTreeEntry, IniFileEntry, ModlistEntry } from "../../types/mod.types";

export function useRightPanel(selectedMod: ModlistEntry | null, selectedGame: string) {
  const [activeRightTab, setActiveRightTab] = useState<RightTab>("files");
  const [modFiles, setModFiles] = useState<FileTreeEntry[] | null>(null);
  const [modFilesLoading, setModFilesLoading] = useState(false);
  const [iniFiles, setIniFiles] = useState<IniFileEntry[]>([]);
  const [iniLoading, setIniLoading] = useState(false);
  const [selectedIni, setSelectedIni] = useState<string | null>(null);
  const [iniContent, setIniContent] = useState("");
  const [dataFiles, setDataFiles] = useState<FileTreeEntry[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [excludedFiles, setExcludedFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedMod || activeRightTab !== "files") { setModFiles(null); return; }
    (async () => {
      const stagingDir = selectedMod.stagingDir;
      if (!stagingDir) { setModFiles([]); return; }
      setModFilesLoading(true);
      try {
        const files = await window.electron.listModFiles(stagingDir) as unknown as FileTreeEntry[];
        setModFiles(files);
      } catch { setModFiles([]); }
      setModFilesLoading(false);
    })();
  }, [selectedMod, activeRightTab]);

  useEffect(() => {
    if (activeRightTab !== "ini") { setIniFiles([]); return; }
    (async () => {
      setIniLoading(true);
      try {
        const gameCfg = await window.electron.getGameConfig(selectedGame);
        const iniDir = gameCfg?.gamePath
          ? `${gameCfg.gamePath}/Data`
          : `${gameCfg?.stagingDir || ""}/INI`;
        const files = await window.electron.listIniFiles(iniDir) as unknown as IniFileEntry[];
        setIniFiles(files);
      } catch { setIniFiles([]); }
      setIniLoading(false);
    })();
  }, [activeRightTab, selectedGame]);

  useEffect(() => {
    if (activeRightTab !== "data" || !selectedGame) { setDataFiles([]); return; }
    (async () => {
      setDataLoading(true);
      try {
        const gameCfg = await window.electron.getGameConfig(selectedGame);
        const gamePath = gameCfg?.gamePath;
        if (gamePath) {
          const files = await window.electron.listDataFolder(gamePath, selectedGame) as unknown as FileTreeEntry[];
          setDataFiles(files);
        }
      } catch { setDataFiles([]); }
      setDataLoading(false);
    })();
  }, [activeRightTab, selectedGame]);

  const toggleExcludedFile = useCallback((filePath: string) => {
    setExcludedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }, []);

  return {
    activeRightTab,
    setActiveRightTab,
    modFiles,
    modFilesLoading,
    iniFiles,
    iniLoading,
    selectedIni,
    setSelectedIni,
    iniContent,
    setIniContent,
    dataFiles,
    dataLoading,
    excludedFiles,
    toggleExcludedFile,
  };
}

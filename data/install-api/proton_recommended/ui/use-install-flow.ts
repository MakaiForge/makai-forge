import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLibrary } from "@hooks/use-library";
import type { GameShop, ProtonVersion, ProtonFork } from "@types";

export interface CandidateExe {
  path: string;
  name: string;
  size: number;
}

export interface InstallProgress {
  status: string;
  percent: number;
  gameTitle?: string;
}

export function useInstallFlow() {
  const navigate = useNavigate();
  const { library, updateLibrary } = useLibrary();

  const [showRecommendationModal, setShowRecommendationModal] = useState(false);
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [showScanningModal, setShowScanningModal] = useState(false);
  const [showCopyingModal, setShowCopyingModal] = useState(false);
  const [showInstallSuccessModal, setShowInstallSuccessModal] = useState(false);
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);
  const [installedProtons, setInstalledProtons] = useState<ProtonVersion[]>([]);
  const [candidates, setCandidates] = useState<CandidateExe[]>([]);
  const [prefixDriveCPath, setPrefixDriveCPath] = useState<string>("");

  const suggestedDirRef = useRef<string | null>(null);
  const pendingInstallRef = useRef<[GameShop, string] | null>(null);
  const pendingGameRef = useRef<[GameShop, string] | null>(null);
  const pendingGameIdRef = useRef<string>("");
  const pendingGameTitleRef = useRef<string>("");

  useEffect(() => {
    const unsub = window.electron.onInstallProgress((value) => {
      setInstallProgress(value);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (installProgress?.status === "copying") {
      setShowScanningModal(false);
      setShowCopyingModal(true);
    }
  }, [installProgress]);

  useEffect(() => {
    if (installProgress?.status !== "complete") return;
    const timer = setTimeout(() => {
      setInstallProgress(null);
    }, 2500);
    return () => clearTimeout(timer);
  }, [installProgress]);

  const handleExePicked = useCallback(async (path: string) => {
    setShowCandidateModal(false);
    const pending = pendingGameRef.current;
    if (!pending) return;
    const [shop, objectId] = pending;
    pendingGameRef.current = null;
    await window.electron.setGameExecutablePath(shop, objectId, path);
    setShowInstallSuccessModal(true);
  }, []);

  const handleNavigateToGames = useCallback(() => {
    setShowInstallSuccessModal(false);
    updateLibrary();
    navigate("/games");
  }, [navigate, updateLibrary]);

  const handleOpenExePicker = useCallback(async (dirOverride?: string) => {
    const path = await window.electron.openExeFilePicker(
      dirOverride ?? suggestedDirRef.current ?? undefined
    );
    if (path) {
      setShowCandidateModal(false);
      await handleExePicked(path);
    }
  }, [handleExePicked]);

  const handleDownloadAndSelect = useCallback(async (fork: ProtonFork) => {
    const pending = pendingInstallRef.current;
    if (!pending) return;

    setShowRecommendationModal(false);

    const [shop, objectId] = pending;
    const game = library.find(
      (g) => g.shop === shop && g.objectId === objectId
    );

    try {
      const protonPath = await window.electron.downloadProton(fork);
      if (!protonPath) {
        throw new Error("Falha ao baixar Proton");
      }

      pendingInstallRef.current = null;

      setShowScanningModal(true);

      const result = await window.electron.openGameInstaller(shop, objectId, protonPath, game?.title);

      setShowScanningModal(false);
      setShowCopyingModal(false);
      setInstallProgress(null);
      suggestedDirRef.current = result.suggestedDir || null;

      if (result.executableSelectWindowOpened) {
        // executável será selecionado na janela separada
      } else if (result.candidates && result.candidates.length > 0) {
        setCandidates(result.candidates);
        setPrefixDriveCPath(
          result.suggestedDir?.split("drive_c")[0] + "drive_c" || ""
        );
        setShowCandidateModal(true);
      } else {
        suggestedDirRef.current = result.suggestedDir;
        await handleOpenExePicker();
      }
      updateLibrary();
    } catch {
      setInstallProgress({ status: "error", percent: 0, gameTitle: game?.title });
    }
  }, [library, updateLibrary, handleOpenExePicker]);

  const handleSelectProton = useCallback(async (protonPath: string) => {
    setShowRecommendationModal(false);
    const pending = pendingInstallRef.current;
    if (!pending) return;

    const [shop, objectId] = pending;
    const game = library.find(
      (g) => g.shop === shop && g.objectId === objectId
    );

    setInstallProgress({
      status: "prefix",
      percent: 80,
      gameTitle: game?.title,
    });

    pendingInstallRef.current = null;

    setShowScanningModal(true);

    try {
      const result = await window.electron.openGameInstaller(shop, objectId, protonPath, game?.title);
      setShowScanningModal(false);
      setShowCopyingModal(false);
      setInstallProgress(null);
      suggestedDirRef.current = result.suggestedDir || null;

      if (result.executableSelectWindowOpened) {
        // executável será selecionado na janela separada
      } else if (result.candidates && result.candidates.length > 0) {
        setCandidates(result.candidates);
        setShowCandidateModal(true);
      } else {
        await handleOpenExePicker(result.suggestedDir ?? undefined);
      }
    } catch {
      setShowScanningModal(false);
      setInstallProgress({ status: "error", percent: 0, gameTitle: game?.title });
    }
  }, [library, handleOpenExePicker]);

  const handleOpenGameInstaller = useCallback(async (shop: GameShop, objectId: string) => {
    const versions = await window.electron.getInstalledProtonVersions();

    if (!versions || versions.length === 0) {
      navigate("/proton-tools");
      return;
    }

    const game = library.find((g) => g.shop === shop && g.objectId === objectId);

    pendingInstallRef.current = [shop, objectId];
    pendingGameRef.current = [shop, objectId];
    pendingGameIdRef.current = objectId;
    pendingGameTitleRef.current = game?.title || objectId;
    setInstalledProtons(versions);
    setShowRecommendationModal(true);
  }, [navigate, library]);

  return {
    showRecommendationModal,
    setShowRecommendationModal,
    showCandidateModal,
    setShowCandidateModal,
    showScanningModal,
    setShowScanningModal,
    showCopyingModal,
    setShowCopyingModal,
    showInstallSuccessModal,
    setShowInstallSuccessModal,
    installProgress,
    setInstallProgress,
    installedProtons,
    candidates,
    prefixDriveCPath,
    pendingGameRef,
    pendingInstallRef,
    pendingGameIdRef,
    pendingGameTitleRef,
    suggestedDirRef,

    handleOpenGameInstaller,
    handleSelectProton,
    handleDownloadAndSelect,
    handleExePicked,
    handleOpenExePicker,
    handleNavigateToGames,
  };
}

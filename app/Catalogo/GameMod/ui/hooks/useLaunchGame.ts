import { useState, useCallback, useEffect } from "react";
import type { ModlistEntry } from "../types/mod.types";

interface UseLaunchGameOpts {
  selectedGame: string | null;
  selectedProfile: string;
  currentGame: { name: string } | null;
  addLog: (msg: string) => void;
}

export interface LaunchStep {
  key: string;
  label: string;
  status: "waiting" | "working" | "done" | "error";
  message?: string;
}

export function useLaunchGame({
  selectedGame,
  selectedProfile,
  currentGame,
  addLog,
}: UseLaunchGameOpts) {
  const [launchSteps, setLaunchSteps] = useState<LaunchStep[]>([]);
  const [showLaunchOverlay, setShowLaunchOverlay] = useState(false);
  const [playError, setPlayError] = useState<{ error: string; failedStep?: string } | null>(null);
  const isLaunching = launchSteps.some(s => s.status === "working");

  // Listen for launch progress from backend
  useEffect(() => {
    return window.electron.onModLaunchProgress(data => {
      setLaunchSteps(prev => {
        const idx = prev.findIndex(s => s.key === data.step);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            status: data.status as any,
            message: data.message,
          };
          return next;
        }
        return prev;
      });
    });
  }, []);

  const handleLaunchClick = useCallback(() => {
    if (!selectedGame) {
      return; // caller should open detection wizard
    }
    const displayName = currentGame?.name || selectedGame;
    setLaunchSteps([
      { key: "detect", label: "Detectando jogo", status: "working" },
      { key: "proton", label: "Verificando Proton", status: "waiting" },
      { key: "prefix", label: "Verificando prefixo", status: "waiting" },
      { key: "dll", label: "Configurando DLL Overrides", status: "waiting" },
      { key: "registry", label: "Registro do jogo", status: "waiting" },
      { key: "deploy", label: "Implantando mods", status: "waiting" },
      { key: "skse", label: "Verificando SKSE", status: "waiting" },
      { key: "launch", label: "Iniciando jogo", status: "waiting" },
    ]);
    setShowLaunchOverlay(true);

    // Mod Manager: inicializar jogo COM mods (deployMods: true).
    // A aba Games usa modPlayGame sem essa opção — apenas inicializa o jogo.
    window.electron.modPlayGame(selectedGame, selectedProfile, { deployMods: true }).then(result => {
      if (result.success) {
        addLog(`✅ ${displayName} iniciado via ${result.method}`);
        setTimeout(() => {
          setShowLaunchOverlay(false);
          setLaunchSteps([]);
        }, 2000);
      } else {
        setLaunchSteps(prev => {
          const failed = prev.find(s => s.status === "working");
          if (failed) {
            return prev.map(s => s.key === failed.key ? { ...s, status: "error" as const, message: result.error } : s);
          }
          return prev;
        });
        setTimeout(() => {
          setShowLaunchOverlay(false);
          setLaunchSteps([]);
          setPlayError({
            error: result.error || "Falha ao iniciar o jogo",
            failedStep: result.failedStep,
          });
        }, 1500);
      }
    }).catch(e => {
      addLog(`❌ Erro: ${e}`);
      setTimeout(() => {
        setShowLaunchOverlay(false);
        setLaunchSteps([]);
        setPlayError({
          error: String(e),
          failedStep: "unknown",
        });
      }, 1500);
    });
  }, [selectedGame, selectedProfile, currentGame, addLog]);

  return {
    launchSteps,
    showLaunchOverlay,
    setShowLaunchOverlay,
    playError,
    setPlayError,
    isLaunching,
    handleLaunchClick,
  };
}

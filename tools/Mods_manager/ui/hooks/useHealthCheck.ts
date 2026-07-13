import { useState, useEffect, useCallback, useRef } from "react";

interface UseHealthCheckOpts {
  selectedGame: string | null;
  configGamePath: string;
  configProtonPath: string;
  setShowGameConfig: (v: boolean) => void;
  setOriginalProtonPath: (v: string) => void;
}

export function useHealthCheck({
  selectedGame,
  configGamePath,
  configProtonPath,
  setShowGameConfig,
  setOriginalProtonPath,
}: UseHealthCheckOpts) {
  const [healthBanner, setHealthBanner] = useState<{ status: "loading" | "valid" | "issues" | "error"; message: string } | null>(null);
  const [healthReport, setHealthReport] = useState<{ depsMissing: string[] } | null>(null);
  const scanCounterRef = useRef(0);

  // Health check effect — usa scanEnvironment como fonte única
  useEffect(() => {
    if (!selectedGame || !configGamePath) return;
    let cancelled = false;
    (async () => {
      setHealthBanner({ status: "loading", message: "Verificando ambiente..." });
      try {
        const env = await (window.electron as any).scanEnvironment(selectedGame);
        if (cancelled) return;

        if (env?.ready) {
          setHealthReport({ depsMissing: env.depsMissing || [] });
          setHealthBanner({ status: "valid", message: "Ambiente configurado corretamente" });
        } else if (env?.errors?.length > 0) {
          setHealthReport({ depsMissing: env.depsMissing || [] });
          setHealthBanner({ status: "error", message: env.errors.join("; ") });
        } else {
          setHealthBanner({ status: "issues", message: "Algumas configurações precisam de atenção" });
        }
      } catch {
        if (!cancelled) setHealthBanner({ status: "error", message: "Erro ao verificar ambiente" });
      }
    })();
    return () => { cancelled = true; };
  }, [selectedGame, configGamePath, scanCounterRef.current]);

  // Auto-dismiss valid banner
  useEffect(() => {
    if (healthBanner?.status !== "valid") return;
    const timer = setTimeout(() => setHealthBanner(null), 4000);
    return () => clearTimeout(timer);
  }, [healthBanner]);

  const openConfigForFix = useCallback(() => {
    setOriginalProtonPath(configProtonPath);
    setShowGameConfig(true);
  }, [configProtonPath, setShowGameConfig, setOriginalProtonPath]);

  /** Força re-scan do ambiente (chamar após criar prefixo, instalar proton, etc) */
  const rescanEnvironment = useCallback(() => {
    scanCounterRef.current += 1;
  }, []);

  return {
    healthBanner,
    healthReport,
    openConfigForFix,
    rescanEnvironment,
  };
}

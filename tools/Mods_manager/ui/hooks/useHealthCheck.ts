import { useState, useEffect, useCallback } from "react";

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

  // Health check effect
  useEffect(() => {
    if (!selectedGame || !configGamePath) return;
    let cancelled = false;
    (async () => {
      setHealthBanner({ status: "loading", message: "Verificando prefixo..." });
      try {
        const result = await window.electron.prefixHealthCheck(selectedGame);
        if (cancelled) return;
        if (result.ok && result.data) {
          setHealthReport({ depsMissing: result.data.depsMissing || [] });
          if (result.data.valid) {
            setHealthBanner({ status: "valid", message: "Prefixo configurado corretamente" });
          } else if (result.data.errors.length > 0) {
            setHealthBanner({ status: "error", message: `Problemas: ${result.data.errors.join("; ")}` });
          } else {
            setHealthBanner({ status: "issues", message: "Algumas configurações precisam de atenção" });
          }
        } else {
          setHealthBanner({ status: "error", message: result.error || "Falha ao verificar prefixo" });
        }
      } catch {
        if (!cancelled) setHealthBanner({ status: "error", message: "Erro ao verificar saúde do prefixo" });
      }
    })();
    return () => { cancelled = true; };
  }, [selectedGame, configGamePath]);

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

  return {
    healthBanner,
    healthReport,
    openConfigForFix,
  };
}

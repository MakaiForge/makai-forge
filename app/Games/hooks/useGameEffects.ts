import { useEffect } from "react";
import { setHeaderTitle } from "@renderer/features";

interface GameEffectsParams {
  dispatch: (action: unknown) => void;
  t: (key: string, fallback?: string) => string;
  setDllCheckModal: (v: {
    open: boolean;
    loading: boolean;
    result: { installed: string[]; errors: string[] } | null;
  }) => void;
}

export function useGameEffects({ dispatch, t, setDllCheckModal }: GameEffectsParams): void {
  useEffect(() => {
    dispatch(setHeaderTitle(t("games") || "Games"));
  }, [dispatch, t]);

  useEffect(() => {
    const onStart = () => {
      setDllCheckModal({ open: true, loading: true, result: null });
    };
    const onDone = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setDllCheckModal({ open: true, loading: false, result: detail.result });
    };
    const onError = () => {
      setDllCheckModal({ open: false, loading: false, result: null });
    };
    window.addEventListener("protonforge:dll-check-start", onStart);
    window.addEventListener("protonforge:dll-check-done", onDone);
    window.addEventListener("protonforge:dll-check-error", onError);
    return () => {
      window.removeEventListener("protonforge:dll-check-start", onStart);
      window.removeEventListener("protonforge:dll-check-done", onDone);
      window.removeEventListener("protonforge:dll-check-error", onError);
    };
  }, [setDllCheckModal]);
}

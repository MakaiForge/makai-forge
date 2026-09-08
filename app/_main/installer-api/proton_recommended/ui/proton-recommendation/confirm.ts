import type { ProtonFork } from "@types";
import type { DownloadProgress, SwitchResult } from "./types";

export interface ConfirmContext {
  selectedProton: string | null;
  selectedFork: ProtonFork | null;
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
  findInstalled: (version: string) => { path: string; version: string } | null;
  setSwitching: (value: boolean) => void;
  setSwitchResult: (value: SwitchResult | null) => void;
  setIsDownloading: (value: boolean) => void;
  setDownloadProgress: (value: DownloadProgress | null) => void;
}

export async function runConfirm(ctx: ConfirmContext): Promise<void> {
  const {
    selectedProton,
    selectedFork,
    mode,
    onSelect,
    onSwitchProton,
    onDownloadAndSelect,
    findInstalled,
    setSwitching,
    setSwitchResult,
    setIsDownloading,
    setDownloadProgress,
  } = ctx;

  const protonPath =
    selectedProton ||
    (() => {
      if (!selectedFork) return null;
      const installed = findInstalled(selectedFork.version);
      return installed?.path || null;
    })();

  if (!protonPath && !selectedFork) return;

  if (mode === "switch" && onSwitchProton) {
    let pathToSwitch = protonPath;
    if (!pathToSwitch && selectedFork && onDownloadAndSelect) {
      setSwitching(true);
      setSwitchResult(null);
      try {
        pathToSwitch = await window.electron.downloadProton(selectedFork);
      } catch {
        setSwitchResult({
          ok: false,
          msg: "Falha ao baixar o Proton selecionado.",
        });
        setSwitching(false);
        return;
      }
      if (!pathToSwitch) {
        setSwitchResult({
          ok: false,
          msg: "Falha ao baixar o Proton selecionado.",
        });
        setSwitching(false);
        return;
      }
    }
    if (!pathToSwitch) {
      setSwitchResult({
        ok: false,
        msg: "Nenhum Proton selecionado para trocar.",
      });
      return;
    }
    setSwitching(true);
    setSwitchResult(null);
    try {
      const result = await onSwitchProton(pathToSwitch);
      if (result && typeof result === "object") {
        if (result.ok) {
          setSwitchResult({
            ok: true,
            msg: `Proton trocado com sucesso! Saves restaurados: ${
              result.data?.savesRestored ?? 0
            }`,
          });
        } else {
          setSwitchResult({
            ok: false,
            msg: result.error || "Falha ao trocar Proton",
          });
        }
      }
    } catch (err) {
      setSwitchResult({ ok: false, msg: `Erro: ${String(err)}` });
    }
    setSwitching(false);
    return;
  }

  if (selectedProton) {
    onSelect(selectedProton);
    return;
  }
  if (selectedFork) {
    const installed = findInstalled(selectedFork.version);
    if (installed) {
      onSelect(installed.path);
      return;
    }
    if (onDownloadAndSelect) {
      setIsDownloading(true);
      setDownloadProgress({ status: "Iniciando...", percent: 0 });
      try {
        await onDownloadAndSelect(selectedFork);
      } catch {
        // erro tratado por quem chamou
      } finally {
        setIsDownloading(false);
        setDownloadProgress(null);
      }
    }
  }
}

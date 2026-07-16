import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileDirectoryIcon } from "@primer/octicons-react";
import type { Game, GameShop } from "@types";
import "./game-launcher.scss";

type PreflightStatus =
  | "idle" | "checking" | "downloading" | "installing"
  | "selecting" | "complete" | "error";

interface ExeCandidate { path: string; name: string; size: number }

export default function GameLauncher() {
  const { t } = useTranslation("game_launcher");
  const [searchParams] = useSearchParams();
  const shop = searchParams.get("shop") as GameShop;
  const objectId = searchParams.get("objectId");
  const bgPath = searchParams.get("bg") || "";

  const [game, setGame] = useState<Game | null>(null);
  const [preflightStatus, setPreflightStatus] = useState<PreflightStatus>("idle");
  const [preflightDetail, setPreflightDetail] = useState<string | null>(null);
  const [preflightPercent, setPreflightPercent] = useState<number | null>(null);
  const [preflightStarted, setPreflightStarted] = useState(false);
  const [selectingExecutable, setSelectingExecutable] = useState(false);
  const [visible, setVisible] = useState(false);
  const selectHandledRef = useRef(false);

  const [exeCandidates, setExeCandidates] = useState<ExeCandidate[]>([]);
  const [prefixDriveCPath, setPrefixDriveCPath] = useState("");
  const [selectedExeIndex, setSelectedExeIndex] = useState<number | null>(null);

  useEffect(() => {
    if (shop && objectId) {
      window.electron.getGameByObjectId(shop, objectId).then(setGame);
    }
  }, [shop, objectId]);

  useEffect(() => {
    if (!window.electron.onPreflightProgress) return;
    const unsub = window.electron.onPreflightProgress(({ status, detail, percent }) => {
      setPreflightStarted(true);
      setPreflightStatus(status as PreflightStatus);
      setPreflightDetail(detail);
      if (percent != null) setPreflightPercent(percent);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!window.electron.onSelectExecutable) return;
    const unsub = window.electron.onSelectExecutable((value) => {
      setExeCandidates(value.candidates);
      setPrefixDriveCPath(value.prefixDriveCPath);
      setSelectedExeIndex(value.candidates.length > 0 ? 0 : null);
      setSelectingExecutable(true);
      setPreflightStatus("selecting");
      selectHandledRef.current = false;
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!visible) { setVisible(true); window.electron.showGameLauncherWindow(); }
  }, [visible]);

  const handleConfirmExe = useCallback(() => {
    if (selectedExeIndex === null || !exeCandidates[selectedExeIndex] || selectHandledRef.current) return;
    selectHandledRef.current = true;
    window.electron.selectExecutable(shop!, objectId!, exeCandidates[selectedExeIndex].path);
    setSelectingExecutable(false);
    setPreflightStatus("complete");
  }, [selectedExeIndex, exeCandidates, shop, objectId]);

  const handleBrowseExe = useCallback(async () => {
    const result = await window.electron.showOpenDialog({
      title: "Select Game Executable",
      filters: [{ name: "Executaveis", extensions: ["exe", "msi"] }],
      properties: ["openFile"],
      defaultPath: prefixDriveCPath || undefined,
    });
    if (result.canceled || !result.filePaths?.[0]) return;
    window.electron.selectExecutable(shop!, objectId!, result.filePaths[0]);
    setSelectingExecutable(false);
    setPreflightStatus("complete");
  }, [prefixDriveCPath, shop, objectId]);

  const isRunning = preflightStarted &&
    (preflightStatus === "checking" || preflightStatus === "downloading" || preflightStatus === "installing");

  const hasPercent = preflightPercent != null && preflightPercent > 0;

  const getStatusMessage = () => {
    const suffix = hasPercent ? ` ${preflightPercent}%` : "";
    switch (preflightStatus) {
      case "checking": return `${preflightDetail || "Verificando..."}${suffix}`;
      case "downloading": return `${preflightDetail || "Baixando..."}${suffix}`;
      case "installing":
      case "analyzing":
      case "copying":
      case "scanning":
      case "preparing":
      case "snapshot": return `${preflightDetail || "Processando..."}${suffix}`;
      case "complete": return preflightPercent === 100 ? "Pronto! Divirta-se!" : preflightDetail || "Pronto!";
      case "error": return preflightDetail || "Erro";
      default: return preflightDetail || "";
    }
  };

  const closeWin = () => window.electron.closeGameLauncherWindow();

  const gameTitle = game?.title || "";

  return (
    <div className="game-launcher">
      {bgPath && (
        <div className="game-launcher__bg" style={{ backgroundImage: `url("file://${bgPath}")` }} />
      )}
      <div className="game-launcher__overlay" />
      <button className="game-launcher__close" onClick={closeWin} aria-label="Fechar">&#x2715;</button>

      {selectingExecutable ? (
        <div className="game-launcher__modal-overlay">
          <div className="game-launcher__modal-card">
            <h2 className="game-launcher__modal-title">{t("select_executable_title", "Selecione o executável")}</h2>
            <p className="game-launcher__modal-desc">
              {exeCandidates.length > 0
                ? "Encontramos estes executáveis no prefixo:"
                : "Nenhum executável encontrado. Use 'Procurar'."}
            </p>
            {exeCandidates.length > 0 && (
              <div className="game-launcher__exe-list">
                {exeCandidates.map((exe, idx) => (
                  <button key={exe.path} type="button"
                    className={`game-launcher__exe-option ${selectedExeIndex === idx ? "game-launcher__exe-option--selected" : ""}`}
                    onClick={() => setSelectedExeIndex(idx)}>
                    <FileDirectoryIcon size={14} />
                    <div className="game-launcher__exe-option-info">
                      <div className="game-launcher__exe-option-name">{exe.name}</div>
                      <div className="game-launcher__exe-option-path">{exe.path.replace(prefixDriveCPath, "")}</div>
                    </div>
                    <div className="game-launcher__exe-option-size">{(exe.size / 1024 / 1024).toFixed(1)} MB</div>
                  </button>
                ))}
              </div>
            )}
            <div className="game-launcher__exe-actions">
              <button type="button" className="game-launcher__button game-launcher__button--secondary" onClick={handleBrowseExe}>
                Procurar
              </button>
              <button type="button" className="game-launcher__button"
                onClick={handleConfirmExe}
                disabled={exeCandidates.length === 0 || selectedExeIndex === null}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="game-launcher__content">
          {gameTitle && <p className="game-launcher__title">{gameTitle}</p>}
          <p className="game-launcher__status">{getStatusMessage()}</p>
          <div className="game-launcher__bar-track">
            <div className={`game-launcher__bar-fill ${isRunning && !hasPercent ? "game-launcher__bar-fill--indeterminate" : ""}`}
              style={(hasPercent || preflightStatus === "complete") ? { width: `${Math.max(2, preflightPercent ?? 100)}%` } : undefined} />
          </div>
        </div>
      )}
    </div>
  );
}

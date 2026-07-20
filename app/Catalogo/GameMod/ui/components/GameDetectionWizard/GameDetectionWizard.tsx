import { useState, useEffect, useCallback } from "react";
import { Button } from "@renderer/components";
import "./GameDetectionWizard.scss";

interface GameDetectionWizardProps {
  open: boolean;
  onClose: () => void;
  onGameDetected: (gameId: string, gamePath: string) => void;
  selectedGameId?: string;
}

type WizardStep = "detecting" | "result" | "saved";

interface DetectionAttempt {
  gameId: string;
  name: string;
  source: string;
  found: boolean;
}

export function GameDetectionWizard({ open, onClose, onGameDetected, selectedGameId: initialGameId }: GameDetectionWizardProps) {
  const [step, setStep] = useState<WizardStep>("detecting");
  const [detected, setDetected] = useState<DetectionAttempt[]>([]);
  const [chosenGameId, setChosenGameId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const startDetection = useCallback(async (targetGameId?: string) => {
    setStep("detecting");
    setError(null);
    setDetected([]);
    try {
      const catalogResult = await window.electron.getGameDllCatalog();
      if (!catalogResult.ok || !catalogResult.data?.games) {
        setError("Catalogo de jogos nao disponivel");
        return;
      }
      const games = catalogResult.data.games;
      const scanTarget = targetGameId
        ? games.filter((g: any) => g.gameId === targetGameId)
        : games;
      const found: DetectionAttempt[] = [];
      for (const game of scanTarget) {
        const result = await window.electron.modDetectGamePath(game.gameId);
        found.push({
          gameId: game.gameId,
          name: game.name,
          source: result?.gamePath ? "Steam/GOG" : "",
          found: !!result?.gamePath,
        });
      }
      setDetected(found);
      const firstFound = found.find((g) => g.found);
      if (firstFound) setChosenGameId(firstFound.gameId);
      setStep("result");
    } catch (e: any) {
      setError(e.message || "Erro na deteccao");
      setStep("result");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setChosenGameId("");
    setDetected([]);
    setError(null);
    setInfoMsg(null);
    startDetection(initialGameId);
  }, [open, initialGameId, startDetection]);

  const handleSelectManual = async () => {
    const res = await window.electron.showOpenDialog({ properties: ["openDirectory"] });
    if (res.canceled || !res.filePaths[0]) return;
    const selectedPath = res.filePaths[0];
    const catalogResult = await window.electron.getGameDllCatalog();
    if (!catalogResult.ok || !catalogResult.data?.games) return;
    for (const game of catalogResult.data.games) {
      const result = await window.electron.detectGameManual(game.gameId, selectedPath);
      if (result.ok && result.data) {
        onGameDetected(game.gameId, selectedPath);
        onClose();
        return;
      }
    }
    setError("Nenhum jogo reconhecido neste diretorio");
  };

  const handleConfirm = async (gameId: string) => {
    const game = detected.find((g) => g.gameId === gameId);
    if (!game || !game.found || !game.source) return;
    const result = await window.electron.modDetectGamePath(gameId);
    if (result?.gamePath) {
      onGameDetected(gameId, result.gamePath);
    }
    setStep("saved");
  };

  const foundCount = detected.filter((g) => g.found).length;
  const selectedGame = detected.find((g) => g.gameId === initialGameId);
  const selectedNotFound = selectedGame && !selectedGame.found;
  const allNotFound = detected.length > 0 && foundCount === 0;

  const handleRetry = () => {
    if (selectedNotFound) {
      setInfoMsg("Jogo ja encontrado! Selecione abaixo e clique em Configurar Selecionado.");
      setTimeout(() => setInfoMsg(null), 3000);
    } else {
      startDetection(initialGameId);
    }
  };

  return (
    <div className={`detection-wizard-overlay ${open ? "detection-wizard-overlay--open" : ""}`} onClick={onClose}>
      <div className="detection-wizard" onClick={(e) => e.stopPropagation()}>
        {step === "detecting" && (
          <div className="detection-wizard__step">
            <h2>Detectando jogos instalados...</h2>
            <div className="detection-wizard__spinner" />
            <p>Procurando em bibliotecas Steam e GOG...</p>
          </div>
        )}

        {step === "result" && (
          <div className="detection-wizard__step">
            {selectedNotFound || allNotFound ? (
              <>
                <h2>Jogo nao encontrado</h2>
                <div className="detection-wizard__alternative-notice">
                  <p>
                    <strong>{selectedGame?.name || "O jogo selecionado"}</strong> nao foi encontrado
                    nas bibliotecas Steam ou GOG do seu sistema.
                  </p>
                  <p>
                    Isso significa que o jogo esta em uma <strong>biblioteca alternativa</strong> (por exemplo, uma instalacao manual, DRM-free, ou outro launcher).
                  </p>
                  <p>
                    Clique em <strong>Configurar</strong> para selecionar manualmente a pasta onde o executavel do jogo esta localizado.
                  </p>
                </div>
              </>
            ) : (
              <>
                <h2>Jogos Detectados</h2>
                <p>{foundCount} jogo(s) encontrado(s) automaticamente.</p>
              </>
            )}

            {error && <p className="detection-wizard__error">{error}</p>}
            {infoMsg && <p className="detection-wizard__info">{infoMsg}</p>}

            {detected.length > 1 && (
              <div className="detection-wizard__game-list">
                {detected.map((g) => (
                  <div
                    key={g.gameId}
                    className={`detection-wizard__game-item ${g.found ? "detection-wizard__game-item--found" : ""} ${chosenGameId === g.gameId ? "detection-wizard__game-item--selected" : ""}`}
                    onClick={() => g.found && setChosenGameId(g.gameId)}
                  >
                    <span className="detection-wizard__game-name">{g.name}</span>
                    {g.found ? (
                      <span className="detection-wizard__game-status detection-wizard__game-status--found">{g.source}</span>
                    ) : (
                      <span className="detection-wizard__game-status detection-wizard__game-status--missing">Nao encontrado</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="detection-wizard__actions">
              <Button onClick={handleSelectManual}>Configurar</Button>
              <Button onClick={handleRetry}>Buscar Novamente</Button>
              {foundCount > 0 && (
                <Button
                  theme="primary"
                  disabled={!chosenGameId || !detected.find((g) => g.gameId === chosenGameId)?.found}
                  onClick={() => handleConfirm(chosenGameId)}
                >
                  Configurar Selecionado
                </Button>
              )}
            </div>
          </div>
        )}

        {step === "saved" && (
          <div className="detection-wizard__step">
            <h2>Jogo Configurado!</h2>
            <p>O jogo foi configurado com paths padrao.</p>
            <p>Voce pode ajustar as configuracoes no painel de Configuracoes do Jogo.</p>
            <Button theme="primary" onClick={onClose}>Concluir</Button>
          </div>
        )}
      </div>
    </div>
  );
}

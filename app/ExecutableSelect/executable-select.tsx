import { useCallback, useEffect, useState } from "react";
import { FileDirectoryIcon, SearchIcon, CheckCircleIcon } from "@primer/octicons-react";
import { Button } from "@renderer/components";
import "./executable-select.scss";

interface Candidate {
  path: string;
  name: string;
  size: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ExecutableSelect() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [prefixDriveCPath, setPrefixDriveCPath] = useState("");
  const [gameTitle, setGameTitle] = useState("");
  const [shop, setShop] = useState("");
  const [objectId, setObjectId] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    window.electron.getPendingExecutableSelection().then((data) => {
      if (!data) {
        setError("Nenhum dado de seleção encontrado.");
        setLoading(false);
        return;
      }
      setCandidates(data.candidates || []);
      setPrefixDriveCPath(data.prefixDriveCPath || "");
      setGameTitle(data.gameTitle || "");
      setShop(data.shop);
      setObjectId(data.objectId);
      setSelectedIndex(data.candidates.length > 0 ? 0 : null);
      setLoading(false);
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (selectedIndex === null || !candidates[selectedIndex]) return;
    const path = candidates[selectedIndex].path;
    try {
      await window.electron.confirmExecutableSelection(shop, objectId, path);
      setSuccess(true);
    } catch (err) {
      console.error("Failed to save executable path:", err);
    }
  }, [selectedIndex, candidates, shop, objectId]);

  const handleGoToGames = useCallback(async () => {
    await window.electron.cancelExecutableSelection();
  }, []);

  const handleBrowse = useCallback(async () => {
    const downloadsPath = await window.electron.getDefaultDownloadsPath();
    const result = await window.electron.showOpenDialog({
      properties: ["openFile"],
      defaultPath: downloadsPath || prefixDriveCPath || undefined,
      filters: [{ name: "Game executable", extensions: ["exe", "lnk"] }],
    });
    if (result.filePaths && result.filePaths.length > 0) {
      try {
        await window.electron.confirmExecutableSelection(shop, objectId, result.filePaths[0]);
      } catch (err) {
        console.error("Failed to save executable path:", err);
      }
    }
  }, [prefixDriveCPath, shop, objectId]);

  const handleCancel = useCallback(async () => {
    await window.electron.cancelExecutableSelection();
  }, []);

  const getRelativePath = (fullPath: string) => {
    if (!prefixDriveCPath) return fullPath;
    const rel = fullPath.replace(prefixDriveCPath, "");
    return rel.startsWith("/") || rel.startsWith("\\") ? rel.slice(1) : rel;
  };

  if (loading) {
    return (
      <div className="executable-select">
        <div className="executable-select__loading">Carregando...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="executable-select">
        <div className="executable-select__error">
          <p>{error}</p>
          <Button onClick={handleCancel}>Fechar</Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="executable-select">
        <div className="executable-select__success">
          <CheckCircleIcon size={48} className="executable-select__success-icon" />
          <h2>Jogo instalado com sucesso!</h2>
          <p>O executável foi configurado e o jogo está pronto para jogar.</p>
          <Button theme="primary" onClick={handleGoToGames}>
            Ir para Games
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="executable-select">
      <div className="executable-select__header">
        <h1>Selecionar executável do jogo</h1>
        {gameTitle && <p className="executable-select__subtitle">{gameTitle}</p>}
      </div>

      <div className="executable-select__content">
        {candidates.length > 0 && (
          <>
            <p className="executable-select__description">
              Encontramos estes executáveis no prefixo Wine. Selecione o executável principal do jogo:
            </p>

            <div className="executable-select__list">
              {candidates.map((exe, index) => (
                <button
                  key={exe.path}
                  type="button"
                  className={`executable-select__option ${
                    selectedIndex === index ? "executable-select__option--selected" : ""
                  }`}
                  onClick={() => setSelectedIndex(index)}
                >
                  <FileDirectoryIcon size={20} />
                  <div className="executable-select__option-info">
                    <span className="executable-select__option-name">{exe.name}</span>
                    <span className="executable-select__option-path">{getRelativePath(exe.path)}</span>
                  </div>
                  <span className="executable-select__option-size">{formatFileSize(exe.size)}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {candidates.length === 0 && (
          <p className="executable-select__description">
            Nenhum executável foi encontrado automaticamente. Use o botão "Procurar" para localizar manualmente o executável principal do jogo.
          </p>
        )}
      </div>

      <div className="executable-select__actions">
        <Button theme="outline" onClick={handleBrowse}>
          <SearchIcon size={14} />
          <span style={{ marginLeft: 6 }}>Procurar</span>
        </Button>
        <div className="executable-select__actions-right">
          <Button theme="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button
            theme="primary"
            onClick={handleConfirm}
            disabled={candidates.length === 0 || selectedIndex === null}
          >
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}

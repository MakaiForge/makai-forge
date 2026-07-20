import { useState, useEffect, useRef } from "react";
import { Button, TextField } from "@renderer/components";
import { gamesService, type GameConfig } from "@games-ui/AddGame/games-service";
import { searchGameCover } from "@games-ui/pages/games/services/cover-resolver";
import "./add-game-modal.scss";

interface AddGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGameAdded: () => void;
}

export function AddGameModal({ isOpen, onClose, onGameAdded }: AddGameModalProps) {
  const [name, setName] = useState("");
  const [executable, setExecutable] = useState("");
  const [prefix, setPrefix] = useState("");
  const [runner, setRunner] = useState<"proton" | "wine" | "steam">("proton");
  const [protonVersion, setProtonVersion] = useState("");
  const [installedProtons, setInstalledProtons] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  const initialRender = useRef(true);

  useEffect(() => {
    if (isOpen) {
      resetFields();
      loadInstalledProtons();
    }
  }, [isOpen]);

  const resetFields = () => {
    setName(""); setExecutable(""); setPrefix("");
    setRunner("proton"); setProtonVersion(""); setCoverUrl(null);
    initialRender.current = true;
  };

  const loadInstalledProtons = async () => {
    try {
      const protons = (await window.electron.getInstalledProtonTools()) as any[];
      const protonNames = protons.map((p: any) => {
        if (p.version) return p.version;
        if (p.tool?.title) return p.tool.title;
        if (p.path) return p.path.split("/").pop();
        return "Unknown";
      }).filter(Boolean).sort();
      setInstalledProtons(protonNames);
    } catch { setInstalledProtons([]); }
  };

  const handleNameChange = async (newName: string) => {
    setName(newName);

    const sanitized = newName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const homePath = await window.electron.getUserHomePath();
    const defaultPrefix = `${homePath}/Games/Makai-forger/${sanitized}`;
    setPrefix(defaultPrefix);
  };

  const handleNameBlur = async () => {
    if (!name.trim() || coverUrl) return;
    setSearchLoading(true);
    try {
      const result = await searchGameCover(name);
      if (result?.coverUrl) setCoverUrl(result.coverUrl);
    } catch { /* ignore */ }
    setSearchLoading(false);
  };

  const handleBrowseExecutable = async () => {
    const result = await window.electron.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Executables", extensions: ["exe", "sh", "bin"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });

    if (result.filePaths && result.filePaths.length > 0) {
      setExecutable(result.filePaths[0]);
    }
  };

  const handleBrowsePrefix = async () => {
    const result = await window.electron.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });

    if (result.filePaths && result.filePaths.length > 0) {
      setPrefix(result.filePaths[0]);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);

    const coverResult = coverUrl ? { coverUrl } : await searchGameCover(name);

    const game: GameConfig = {
      objectId: "",
      shop: "custom",
      title: name.trim(),
      slug: gamesService.generateSlug(name),
      runner,
      executablePath: executable.trim() || undefined,
      prefix: prefix.trim() || undefined,
      protonVersion: protonVersion || undefined,
      coverImageUrl: coverResult.coverUrl || undefined,
      isDeleted: false,
      favorite: false,
      playTimeInMilliseconds: 0,
      lastTimePlayed: null,
    };

    try {
      await gamesService.save(game);
      onGameAdded();
      onClose();
    } catch (err) {
      console.error("Failed to add game:", err);
    }
    setSaving(false);
  };

  const handleClose = () => {
    resetFields();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="add-game-overlay" onClick={handleClose}>
      <div className="add-game-modal" onClick={(e) => e.stopPropagation()}>
        <div className="add-game-modal__header">
          <h2>Adicionar Jogo</h2>
          <button className="add-game-modal__close" onClick={handleClose}>✕</button>
        </div>
        <div className="add-game-modal__body">
          <TextField
            placeholder="Nome do jogo"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            onBlur={handleNameBlur}
          />
          {searchLoading && <span className="add-game-modal__searching">Buscando capa...</span>}
          {coverUrl && <img src={coverUrl} alt="Capa" className="add-game-modal__cover" />}

          <div className="add-game-modal__field-row">
            <TextField
              placeholder="Caminho do executável (opcional)"
              value={executable}
              onChange={(e) => setExecutable(e.target.value)}
              className="add-game-modal__field-input"
            />
            <Button onClick={handleBrowseExecutable} variant="secondary">
              Procurar
            </Button>
          </div>

          <div className="add-game-modal__field-row">
            <TextField
              placeholder="Prefixo Wine (opcional)"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              className="add-game-modal__field-input"
            />
            <Button onClick={handleBrowsePrefix} variant="secondary">
              Procurar
            </Button>
          </div>

          <div className="add-game-modal__runner">
            <label>Runner:</label>
            <select value={runner} onChange={(e) => setRunner(e.target.value as any)}>
              <option value="proton">Proton</option>
              <option value="wine">Wine</option>
              <option value="steam">Steam</option>
            </select>
          </div>
          {installedProtons.length > 0 && (
            <div className="add-game-modal__proton">
              <label>Versão Proton:</label>
              <select value={protonVersion} onChange={(e) => setProtonVersion(e.target.value)}>
                <option value="">Padrão</option>
                {installedProtons.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="add-game-modal__footer">
          <Button onClick={handleClose} variant="secondary">Cancelar</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? "Salvando..." : "Adicionar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

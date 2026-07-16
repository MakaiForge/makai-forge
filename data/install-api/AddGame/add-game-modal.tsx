import { useState, useEffect, useRef } from "react";
import { Button, TextField } from "@renderer/components";
import { gamesService, type GameConfig } from "./games-service";
import { searchGameCover } from "@renderer/pages/games/services/cover-resolver";
import "./add-game-modal.scss";

interface AddGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGameAdded: () => void;
}

export function AddGameModal({
  isOpen,
  onClose,
  onGameAdded,
}: AddGameModalProps) {
  const [name, setName] = useState("");
  const [executable, setExecutable] = useState("");
  const [prefix, setPrefix] = useState("");
  const [runner, setRunner] = useState<"proton" | "wine" | "steam">("proton");
  const [protonVersion, setProtonVersion] = useState("");
  const [protonPath, setProtonPath] = useState("");
  const [installedProtons, setInstalledProtons] = useState<string[]>([]);
  const [installedProtonPaths, setInstalledProtonPaths] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const initialRender = useRef(true);

  useEffect(() => {
    if (isOpen) {
      resetFields();
      loadInstalledProtons();
    }
  }, [isOpen]);

  const resetFields = () => {
    setName("");
    setExecutable("");
    setPrefix("");
    setRunner("proton");
    setProtonVersion("");
    setProtonPath("");
    initialRender.current = true;
  };

  const loadInstalledProtons = async () => {
    try {
      const protons =
        (await window.electron.getInstalledProtonTools()) as any[];
      console.log("Loaded protons:", protons);

      const names: string[] = [];
      const paths: Record<string, string> = {};

      for (const p of protons) {
        const name = p.version
          ? p.version
          : p.tool?.title
            ? p.tool.title
            : p.path
              ? p.path.split("/").pop()
              : "Unknown";
        if (!name) continue;
        names.push(name);
        paths[name] = p.path || "";
      }

      setInstalledProtons(names);
      setInstalledProtonPaths(paths);
    } catch (e) {
      console.error("Failed to load protons:", e);
    }
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

  const handleNameChange = async (newName: string) => {
    setName(newName);

    const sanitized = newName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const homePath = await window.electron.getUserHomePath();
    const defaultPrefix = `${homePath}/Games/Makai-forger/${sanitized}`;
    setPrefix(defaultPrefix);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    setSaving(true);

    const coverResult = await searchGameCover(name);
    console.log("Cover search result:", coverResult);

    const game: GameConfig = {
      objectId: "",
      shop: "custom",
      title: name.trim(),
      slug: gamesService.generateSlug(name),
      runner,
      executablePath: executable.trim() || undefined,
      prefix: prefix.trim() || undefined,
      protonVersion: protonVersion || undefined,
      protonPath: protonPath || undefined,
      coverImageUrl: coverResult.coverUrl || undefined,
      isDeleted: false,
      favorite: false,
      playTimeInMilliseconds: 0,
      lastTimePlayed: null,
    };

    console.log("Saving game:", game);
    await gamesService.save(game);
    setSaving(false);

    resetFields();
    onGameAdded();
    onClose();
  };

  const handleClose = () => {
    resetFields();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="add-game-modal-overlay" onClick={handleClose}>
      <div className="add-game-modal" onClick={(e) => e.stopPropagation()}>
        <div className="add-game-modal__header">
          <h2>Add Game</h2>
          <Button onClick={handleClose}>✕</Button>
        </div>

        <form onSubmit={handleSubmit} className="add-game-modal__form">
          <div className="add-game-modal__field">
            <TextField
              label="Game Name"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleNameChange(e.target.value)
              }
              placeholder="Enter game name"
              required
            />
          </div>

          <div className="add-game-modal__field">
            <label className="add-game-modal__label">Executable</label>
            <div className="add-game-modal__input-group">
              <TextField
                value={executable}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setExecutable(e.target.value)
                }
                placeholder="/home/user/Games/game.exe"
              />
              <Button type="button" onClick={handleBrowseExecutable}>
                📁
              </Button>
            </div>
          </div>

          <div className="add-game-modal__field">
            <label className="add-game-modal__label">Wine Prefix</label>
            <div className="add-game-modal__input-group">
              <TextField
                value={prefix}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPrefix(e.target.value)
                }
                placeholder="/home/user/Games/Makai-forger/game-name"
              />
              <Button type="button" onClick={handleBrowsePrefix}>
                📁
              </Button>
            </div>
          </div>

          <div className="add-game-modal__field">
            <label className="add-game-modal__label">Runner</label>
            <select
              value={runner}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setRunner(e.target.value as "proton" | "wine" | "steam")
              }
              className="add-game-modal__select"
            >
              <option value="proton">Proton (Wine)</option>
              <option value="wine">Wine</option>
              <option value="steam">Steam</option>
            </select>
          </div>

          {(runner === "proton" || runner === "wine") && (
            <div className="add-game-modal__field">
              <label className="add-game-modal__label">
                Proton Version ({installedProtons.length} installed)
              </label>
              {installedProtons.length > 0 ? (
                  <select
                    value={protonVersion}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                      const ver = e.target.value;
                      setProtonVersion(ver);
                      setProtonPath(installedProtonPaths[ver] || "");
                    }}
                    className="add-game-modal__select"
                  >
                    <option value="">Auto (System)</option>
                    {installedProtons.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
              ) : (
                <div className="add-game-modal__no-protons">
                  <span>No protons installed</span>
                  <Button
                    type="button"
                    onClick={() => (window.location.hash = "#/proton-tools")}
                  >
                    Go to Proton Tools
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="add-game-modal__actions">
            <Button type="button" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Adding..." : "Add Game"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

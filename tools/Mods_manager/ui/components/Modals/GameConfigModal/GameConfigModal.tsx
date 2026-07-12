import { useState, useEffect } from "react";
import type { BridgeGameInfo as GameInfo } from "../../../types/bridge.types";
import type { ExternalTool } from "../../../../declaration.d.ts";

import "./GameConfigModal.scss";

interface ModuleTool {
  name: string;
  exeName: string;
  hasDownload: boolean;
  downloadUrl: string;
  useProton: boolean;
}

interface GameConfigModalProps {
  open: boolean;
  games: GameInfo[];
  currentGameId: string | null;
  currentProfile: string;
  profiles: string[];
  onSelectGame: (gameId: string) => void;
  onSelectProfile: (profile: string) => void;
  onAddProfile: (name: string) => void;
  onClose: () => void;
}

export function GameConfigModal({
  open, games, currentGameId, currentProfile, profiles,
  onSelectGame, onSelectProfile, onAddProfile, onClose,
}: GameConfigModalProps) {
  const [tools, setTools] = useState<ExternalTool[]>([]);
  const [moduleTools, setModuleTools] = useState<ModuleTool[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [newArgs, setNewArgs] = useState("");
  const [newProton, setNewProton] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (open && currentGameId) {
      window.electron.getExternalTools(currentGameId).then(setTools);
      window.electron.getGameModuleTools(currentGameId).then(setModuleTools);
    }
  }, [open, currentGameId]);

  if (!open) return null;

  async function handleSave() {
    if (!newName.trim() || !newPath.trim() || !currentGameId) return;
    await window.electron.saveExternalTool({
      name: newName.trim(),
      exePath: newPath.trim(),
      args: newArgs.trim(),
      gameId: currentGameId,
      useProton: newProton,
    });
    setNewName(""); setNewPath(""); setNewArgs(""); setNewProton(false);
    setShowAdd(false);
    setTools(await window.electron.getExternalTools(currentGameId));
  }

  async function handleRemove(name: string) {
    if (!currentGameId) return;
    await window.electron.removeExternalTool(name, currentGameId);
    setTools(await window.electron.getExternalTools(currentGameId));
  }

  async function handleLaunch(name: string) {
    if (!currentGameId) return;
    await window.electron.launchExternalTool(currentGameId, name);
  }

  async function handleDownload(toolName: string) {
    if (!currentGameId) return;
    setDownloading(toolName);
    try {
      await window.electron.installExternalTool(currentGameId, toolName);
      setTools(await window.electron.getExternalTools(currentGameId));
    } finally {
      setDownloading(null);
    }
  }

  const installedNames = new Set(tools.map(t => t.name));

  return (
    <div className="game-config-modal__overlay" onClick={onClose}>
      <div className="game-config-modal" onClick={e => e.stopPropagation()}>
        <div className="game-config-modal__header">
          <h3>Game Configuration</h3>
          <button className="game-config-modal__close" onClick={onClose}>×</button>
        </div>

        <div className="game-config-modal__body">
          <label>Game</label>
          <select value={currentGameId ?? ""} onChange={e => onSelectGame(e.target.value)}>
            {games.map(g => (
              <option key={g.game_id} value={g.game_id}>{g.name}</option>
            ))}
          </select>

          <label>Profile</label>
          <select value={currentProfile} onChange={e => onSelectProfile(e.target.value)}>
            {profiles.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <button onClick={() => { const name = prompt("Profile name:"); if (name) onAddProfile(name); }}>
            + New Profile
          </button>

          <hr className="game-config-modal__sep" />

          <label>External Tools</label>

          {moduleTools.length > 0 && (
            <div className="game-config-modal__module-tools">
              {moduleTools.map(mt => {
                const isInstalled = installedNames.has(mt.name);
                const isDownloading = downloading === mt.name;
                return (
                  <div key={mt.name} className="game-config-modal__tool">
                    <div className="game-config-modal__tool-info">
                      <strong>{mt.name}</strong>
                      {isInstalled && <span className="game-config-modal__tool-status">✅ Instalado</span>}
                      {mt.useProton && <span className="game-config-modal__tool-proton">🐧 Proton</span>}
                    </div>
                    <div className="game-config-modal__tool-actions">
                      {isInstalled ? (
                        <button className="game-config-modal__tool-launch" onClick={() => handleLaunch(mt.name)}>Launch</button>
                      ) : mt.hasDownload ? (
                        <button
                          className="game-config-modal__tool-download"
                          onClick={() => handleDownload(mt.name)}
                          disabled={isDownloading}
                        >
                          {isDownloading ? "Baixando..." : "Baixar"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tools.length === 0 && moduleTools.length === 0 && !showAdd && (
            <p className="game-config-modal__empty">No tools configured.</p>
          )}
          {tools.map(tool => (
            <div key={tool.name} className="game-config-modal__tool">
              <div className="game-config-modal__tool-info">
                <strong>{tool.name}</strong>
                <span className="game-config-modal__tool-path">{tool.exePath}</span>
                {tool.args && <span className="game-config-modal__tool-args">args: {tool.args}</span>}
                {tool.useProton && <span className="game-config-modal__tool-proton">🐧 Proton</span>}
              </div>
              <div className="game-config-modal__tool-actions">
                <button className="game-config-modal__tool-launch" onClick={() => handleLaunch(tool.name)}>Launch</button>
                <button className="game-config-modal__tool-remove" onClick={() => handleRemove(tool.name)}>×</button>
              </div>
            </div>
          ))}

          {showAdd && (
            <div className="game-config-modal__add-tool">
              <input placeholder="Tool name" value={newName} onChange={e => setNewName(e.target.value)} />
              <input placeholder="Path to executable" value={newPath} onChange={e => setNewPath(e.target.value)} />
              <input placeholder="Arguments (optional)" value={newArgs} onChange={e => setNewArgs(e.target.value)} />
              <label className="game-config-modal__proton-check">
                <input type="checkbox" checked={newProton} onChange={e => setNewProton(e.target.checked)} />
                Run with Proton
              </label>
              <div className="game-config-modal__add-actions">
                <button onClick={handleSave} disabled={!newName.trim() || !newPath.trim()}>Save</button>
                <button onClick={() => { setShowAdd(false); setNewName(""); setNewPath(""); setNewArgs(""); setNewProton(false); }}>Cancel</button>
              </div>
            </div>
          )}

          {!showAdd && (
            <button onClick={() => setShowAdd(true)}>+ Add Tool</button>
          )}
        </div>

        <div className="game-config-modal__footer">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

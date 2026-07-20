import { useState, useEffect, useCallback } from "react";
import { Modal, Button } from "@renderer/components";
import type { ModlistEntry, PluginEntry } from "../../../types/mod.types";
import "./BackupModal.scss";

interface BackupModalProps {
  open: boolean;
  gameId: string;
  profile: string;
  onClose: () => void;
  onRestored: () => void;
  addLog: (msg: string) => void;
}

export function BackupModal({ open, gameId, profile, onClose, onRestored, addLog }: BackupModalProps) {
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!gameId || !profile) return;
    try {
      const list = await window.electron.listBackups(gameId, profile);
      setBackups(list);
    } catch { setBackups([]); }
  }, [gameId, profile]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const handleCreate = async () => {
    if (!gameId || !profile) return;
    setLoading(true);
    try {
      await window.electron.createBackup(gameId, profile);
      addLog("Backup created");
      await load();
    } catch (e) { addLog(`Backup failed: ${e}`); }
    setLoading(false);
  };

  const handleRestore = async () => {
    if (!selected || !gameId || !profile) return;
    if (!window.confirm("Restore this backup? Current modlist & plugins will be overwritten.")) return;
    setLoading(true);
    try {
      const ok = await window.electron.restoreBackup(gameId, profile, selected);
      if (ok) {
        addLog("Backup restored");
        onRestored();
        onClose();
      } else {
        addLog("Restore failed");
      }
    } catch (e) { addLog(`Restore error: ${e}`); }
    setLoading(false);
  };

  const toggleKeep = async (dir: string, kept: boolean) => {
    await window.electron.setBackupKept(dir, !kept);
    await load();
  };

  return (
    <Modal visible={open} title="Backup & Restore" onClose={onClose}>
      <div className="mod-manager__backup-modal" style={{ minWidth: 400 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Button onClick={handleCreate} disabled={loading || !gameId}>
            {loading ? "Working..." : "New Backup"}
          </Button>
        </div>

        {backups.length === 0 ? (
          <p style={{ color: "#888", fontSize: 12 }}>
            No backups yet. Backups are created automatically before deploy.
          </p>
        ) : (
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {backups.map(b => (
              <div
                key={b.dir}
                onClick={() => setSelected(b.dir)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  cursor: "pointer",
                  borderRadius: 4,
                  background: selected === b.dir ? "#2a3a4a" : "transparent",
                  fontSize: 12,
                }}
              >
                <input
                  type="radio"
                  name="backup"
                  checked={selected === b.dir}
                  onChange={() => setSelected(b.dir)}
                />
                <span style={{ flex: 1, color: "#ccc" }}>{b.timestamp}</span>
                <span
                  onClick={e => { e.stopPropagation(); toggleKeep(b.dir, b.kept); }}
                  style={{
                    color: b.kept ? "#6ecf6e" : "#666",
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  {b.kept ? "Kept" : "Keep"}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <Button onClick={handleRestore} disabled={!selected || loading}>
            Restore
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

export default BackupModal;

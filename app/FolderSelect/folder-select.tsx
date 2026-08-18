import { useCallback, useEffect, useState } from "react";
import { FileDirectoryIcon, FileIcon, CheckCircleIcon } from "@primer/octicons-react";
import { Button } from "@components";
import { logger } from "@shared-logger";
import "./folder-select.scss";

interface FolderItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FolderSelect() {
  const [items, setItems] = useState<FolderItem[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [folderPath, setFolderPath] = useState("");
  const [shop, setShop] = useState("");
  const [objectId, setObjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    window.electron.getPendingFileSelection().then((data) => {
      if (!data) {
        setError("Nenhum dado de seleção encontrado.");
        setLoading(false);
        return;
      }
      setItems(data.items || []);
      setFolderPath(data.folderPath);
      setShop(data.shop);
      setObjectId(data.objectId);
      // Pre-check directories by default
      const preChecked = new Set<string>();
      for (const item of data.items) {
        if (item.isDirectory) preChecked.add(item.path);
      }
      setChecked(preChecked);
      setLoading(false);
    });
  }, []);

  const toggle = useCallback((path: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setChecked(new Set(items.map((i) => i.path)));
  }, [items]);

  const deselectAll = useCallback(() => {
    setChecked(new Set());
  }, []);

  const handleConfirm = useCallback(async () => {
    const selected = Array.from(checked);
    if (selected.length === 0) return;
    try {
      await window.electron.confirmFileSelection(shop, objectId, selected);
      setSuccess(true);
    } catch (err) {
      logger.error("Failed to copy files:", err);
    }
  }, [checked, shop, objectId]);

  const handleCancel = useCallback(async () => {
    await window.electron.cancelFileSelection();
  }, []);

  if (loading) {
    return (
      <div className="folder-select">
        <div className="folder-select__loading">Carregando...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="folder-select">
        <div className="folder-select__error">
          <p>{error}</p>
          <Button onClick={handleCancel}>Fechar</Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="folder-select">
        <div className="folder-select__success">
          <CheckCircleIcon size={48} className="folder-select__success-icon" />
          <h2>Arquivos copiados com sucesso!</h2>
          <p>Os arquivos selecionados foram copiados para o prefixo.</p>
          <Button theme="primary" onClick={handleCancel}>
            Fechar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="folder-select">
      <div className="folder-select__header">
        <h1>Selecionar itens para copiar</h1>
        <p className="folder-select__subtitle">
          Marque os itens que deseja copiar para o prefixo Wine
        </p>
      </div>

      <div className="folder-select__toolbar">
        <Button theme="outline" onClick={selectAll}>
          Selecionar todos
        </Button>
        <Button theme="outline" onClick={deselectAll}>
          Desmarcar todos
        </Button>
        <span className="folder-select__count">
          {checked.size} de {items.length} selecionados
        </span>
      </div>

      <div className="folder-select__list">
        {items.map((item) => (
          <label
            key={item.path}
            className={`folder-select__item ${
              checked.has(item.path) ? "folder-select__item--checked" : ""
            }`}
          >
            <input
              type="checkbox"
              className="folder-select__checkbox"
              checked={checked.has(item.path)}
              onChange={() => toggle(item.path)}
            />
            {item.isDirectory ? (
              <FileDirectoryIcon size={18} className="folder-select__icon" />
            ) : (
              <FileIcon size={18} className="folder-select__icon" />
            )}
            <div className="folder-select__item-info">
              <span className="folder-select__item-name">{item.name}</span>
              {!item.isDirectory && (
                <span className="folder-select__item-size">{formatFileSize(item.size)}</span>
              )}
            </div>
          </label>
        ))}
      </div>

      <div className="folder-select__actions">
        <Button theme="outline" onClick={handleCancel}>
          Cancelar
        </Button>
        <Button
          theme="primary"
          onClick={handleConfirm}
          disabled={checked.size === 0}
        >
          Copiar selecionados ({checked.size})
        </Button>
      </div>
    </div>
  );
}

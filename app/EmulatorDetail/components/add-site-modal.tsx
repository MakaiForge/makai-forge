import { useState } from "react";

interface AddSiteModalProps {
  onConfirm: (name: string, url: string, imageUrl?: string) => void;
  onCancel: () => void;
}

export function AddSiteModal({ onConfirm, onCancel }: AddSiteModalProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    onConfirm(name.trim(), url.trim(), imageUrl.trim() || undefined);
  };

  return (
    <div className="emulator-detail__modal-overlay" onClick={onCancel}>
      <div className="emulator-detail__modal" onClick={(e) => e.stopPropagation()}>
        <h3>Adicionar site</h3>
        <form onSubmit={handleSubmit}>
          <label>
            Nome
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: CoolROM"
              autoFocus
            />
          </label>
          <label>
            URL
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://coolrom.com.au"
            />
          </label>
          <label>
            URL da imagem (opcional)
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://exemplo.com/screenshot.png"
            />
          </label>
          <div className="emulator-detail__modal-actions">
            <button type="button" onClick={onCancel}>Cancelar</button>
            <button type="submit" disabled={!name.trim() || !url.trim()}>Adicionar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

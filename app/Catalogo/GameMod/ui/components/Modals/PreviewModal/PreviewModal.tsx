import "./PreviewModal.scss";

interface PreviewModalProps {
  open: boolean;
  imageUrl: string;
  modName?: string;
  onClose: () => void;
}

export function PreviewModal({ open, imageUrl, modName, onClose }: PreviewModalProps) {
  if (!open) return null;

  return (
    <div className="preview-modal__overlay" onClick={onClose}>
      <div className="preview-modal" onClick={e => e.stopPropagation()}>
        <div className="preview-modal__header">
          <h3>{modName ?? "Preview"}</h3>
          <button className="preview-modal__close" onClick={onClose}>×</button>
        </div>
        <div className="preview-modal__body">
          <img src={imageUrl} alt={modName ?? "Preview"} />
        </div>
      </div>
    </div>
  );
}

import "./ReadmeModal.scss";

interface ReadmeModalProps {
  open: boolean;
  content: string;
  modName?: string;
  onClose: () => void;
}

export function ReadmeModal({ open, content, modName, onClose }: ReadmeModalProps) {
  if (!open) return null;

  return (
    <div className="readme-modal__overlay" onClick={onClose}>
      <div className="readme-modal" onClick={e => e.stopPropagation()}>
        <div className="readme-modal__header">
          <h3>{modName ?? "Readme"}</h3>
          <button className="readme-modal__close" onClick={onClose}>×</button>
        </div>
        <div className="readme-modal__body">
          <pre className="readme-modal__content">{content}</pre>
        </div>
      </div>
    </div>
  );
}

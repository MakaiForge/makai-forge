import { X } from "@phosphor-icons/react";
import "./delete-game-modal.scss";

interface DeleteGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleteGameOnly: () => void;
  onDeleteGameAndPrefix: () => void;
  gameTitle: string;
}

export function DeleteGameModal({
  isOpen,
  onClose,
  onDeleteGameOnly,
  onDeleteGameAndPrefix,
  gameTitle,
}: DeleteGameModalProps) {
  if (!isOpen) return null;

  return (
    <div className="delete-game-modal-overlay" onClick={onClose}>
      <div
        className="delete-game-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Remove Game</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p>How do you want to remove "{gameTitle}"?</p>

          <div className="delete-options">
            <button className="delete-option" onClick={onDeleteGameOnly}>
              <span>📚</span>
              <div className="delete-option-text">
                <strong>Remove from Library</strong>
                <span>Keep game files and prefix</span>
              </div>
            </button>

            <button
              className="delete-option delete-option-danger"
              onClick={onDeleteGameAndPrefix}
            >
              <span>🗑️</span>
              <div className="delete-option-text">
                <strong>Remove Game & Prefix</strong>
                <span>Delete game files and Wine prefix</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

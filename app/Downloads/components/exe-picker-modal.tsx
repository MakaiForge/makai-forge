import { Modal } from "@renderer/components";

import "./exe-picker-modal.scss";

interface ExePickerModalProps {
  visible: boolean;
  candidates: string[];
  title?: string;
  description?: string;
  browseLabel?: string;
  onPick: (path: string) => void;
  onBrowse: () => void;
  onClose: () => void;
}

const DEFAULT_TITLE = "Selecionar executável do jogo";
const DEFAULT_DESC = "Foram encontrados múltiplos executáveis. Selecione qual deve ser usado para iniciar o jogo:";
const DEFAULT_BROWSE = "Abrir na pasta destes arquivos";

export function ExePickerModal({
  visible,
  candidates,
  title,
  description,
  browseLabel,
  onPick,
  onBrowse,
  onClose,
}: ExePickerModalProps) {
  return (
    <Modal
      visible={visible}
      title={title ?? DEFAULT_TITLE}
      onClose={onClose}
      large
    >
      <div className="exe-picker-modal">
        <p className="exe-picker-modal__description">
          {description ?? DEFAULT_DESC}
        </p>

        <ul className="exe-picker-modal__list">
          {candidates.map((p) => (
            <li key={p} className="exe-picker-modal__item">
              <button
                className="exe-picker-modal__btn"
                onClick={() => onPick(p)}
              >
                <span className="exe-picker-modal__name">
                  {p.split("\\").pop()?.split("/").pop()}
                </span>
                <span className="exe-picker-modal__path">{p}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="exe-picker-modal__actions">
          <button
            className="exe-picker-modal__browse-btn"
            onClick={onBrowse}
          >
            {browseLabel ?? DEFAULT_BROWSE}
          </button>
          <button
            className="exe-picker-modal__close-btn"
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}

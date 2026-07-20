import { useTranslation } from "react-i18next";
import { Modal } from "@renderer/components";
import "./remove-game-modal.scss";

interface RemoveGameModalProps {
  visible: boolean;
  gameTitle: string;
  onClose: () => void;
  onRemoveFromList: () => void;
  onDeleteEverything: () => void;
}

export function RemoveGameModal({
  visible,
  gameTitle,
  onClose,
  onRemoveFromList,
  onDeleteEverything,
}: Readonly<RemoveGameModalProps>) {
  const { t } = useTranslation("downloads");

  return (
    <Modal
      visible={visible}
      title={t("remove_game_title", "Remover jogo concluído")}
      description={t(
        "remove_game_description",
        `"${gameTitle}" — Deseja remover o jogo da lista ou excluir todos os arquivos baixados?`
      )}
      onClose={onClose}
    >
      <div className="remove-game-modal__actions">
        <button
          type="button"
          className="remove-game-modal__btn remove-game-modal__btn--cancel"
          onClick={onClose}
        >
          {t("cancel")}
        </button>
        <button
          type="button"
          className="remove-game-modal__btn remove-game-modal__btn--remove-list"
          onClick={onRemoveFromList}
        >
          {t("remove_from_list", "Remover da lista")}
        </button>
        <button
          type="button"
          className="remove-game-modal__btn remove-game-modal__btn--delete-all"
          onClick={onDeleteEverything}
        >
          {t("delete_everything", "Excluir tudo")}
        </button>
      </div>
    </Modal>
  );
}

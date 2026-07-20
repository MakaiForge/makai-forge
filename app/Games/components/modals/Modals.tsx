import type { GameConfig } from "./add-game/games-service";
import { AddGameModal } from "./add-game/AddGameModal";
import { GameConfigModal } from "@renderer/pages/games/components/game-config-modal";
import { DeleteGameModal } from "@renderer/pages/games/components/delete-game-modal";
import { CheckDllsModal } from "@renderer/pages/games/components/check-dlls-modal";
import { BackupModal } from "./backup/BackupModal";
import { BackupPanel } from "./backup/BackupPanel";

interface Props {
  showAddModal: boolean;
  showConfigModal: boolean;
  showDeleteModal: boolean;
  showBackupModal: boolean;
  showBackupPanel: boolean;
  backupProvider: string | null;
  dllCheckModal: {
    open: boolean;
    loading: boolean;
    result: { installed: string[]; errors: string[] } | null;
  };
  selectedGame: GameConfig | null;
  onCloseAdd: () => void;
  onGameAdded: () => void;
  onCloseConfig: () => void;
  onSaveConfig: (game: GameConfig, clearPrefix?: boolean) => Promise<void>;
  onCloseDelete: () => void;
  onDeleteGameOnly: () => void;
  onDeleteGameAndPrefix: () => void;
  onCloseDllCheck: () => void;
  onCloseBackup: () => void;
  onBackupLoginSuccess: (provider: string) => void;
  onCloseBackupPanel: () => void;
  onBackupLogout: () => void;
  onBackupRestore: () => void;
}

export function GamesPageModals({
  showAddModal, showConfigModal, showDeleteModal, showBackupModal, showBackupPanel,
  backupProvider, dllCheckModal, selectedGame,
  onCloseAdd, onGameAdded, onCloseConfig, onSaveConfig,
  onCloseDelete, onDeleteGameOnly, onDeleteGameAndPrefix,
  onCloseDllCheck, onCloseBackup, onBackupLoginSuccess,
  onCloseBackupPanel, onBackupLogout, onBackupRestore,
}: Props) {
  return (
    <>
      {showAddModal && (
        <AddGameModal isOpen={showAddModal} onClose={onCloseAdd} onGameAdded={onGameAdded} />
      )}

      {showConfigModal && selectedGame && (
        <GameConfigModal
          game={selectedGame}
          isOpen={showConfigModal}
          onClose={onCloseConfig}
          onSave={onSaveConfig}
        />
      )}

      {showDeleteModal && selectedGame && (
        <DeleteGameModal
          isOpen={showDeleteModal}
          onClose={onCloseDelete}
          onDeleteGameOnly={onDeleteGameOnly}
          onDeleteGameAndPrefix={onDeleteGameAndPrefix}
          gameTitle={selectedGame.title}
        />
      )}

      {dllCheckModal.open && (
        <CheckDllsModal
          isOpen={dllCheckModal.open}
          loading={dllCheckModal.loading}
          result={dllCheckModal.result}
          onClose={onCloseDllCheck}
        />
      )}

      {showBackupModal && (
        <BackupModal
          isOpen={showBackupModal}
          onClose={onCloseBackup}
          onLoginSuccess={onBackupLoginSuccess}
        />
      )}

      {showBackupPanel && backupProvider && (
        <BackupPanel
          isOpen={showBackupPanel}
          onClose={onCloseBackupPanel}
          provider={backupProvider}
          onLogout={onBackupLogout}
          onRestore={onBackupRestore}
        />
      )}
    </>
  );
}

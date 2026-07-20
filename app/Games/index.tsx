import { LibraryGame } from "@types";
import { GameContextMenu } from "@renderer/components";
import { GamesSkeleton } from "./components/skeleton/GamesSkeleton";
import { GamesSteamSection } from "./components/sections/SteamSection";
import { GamesLocalSection } from "./components/sections/LocalSection";
import { GamesTopBar } from "./components/toolbar/TopBar";

import { GamesPageModals } from "./components/modals/Modals";
import { GamesGameBar } from "./components/gamebar/GameBar";
import { useGamesPage } from "./hooks/useGamesPage";
import "@renderer/pages/games/games.scss";

export default function Games() {
  const p = useGamesPage();

  return (
    <div className="games">
      <GamesTopBar
        searchQuery={p.searchQuery}
        onSearchChange={p.setSearchQuery}
        viewMode={p.viewMode}
        onViewModeChange={p.handleViewModeChange}
        sortBy={p.sortBy}
        onSortChange={p.handleSortChange}
        showHiddenGames={p.showHiddenGames}
        onToggleHidden={() => p.setShowHiddenGames(!p.showHiddenGames)}
        hasHiddenGames={p.hasHiddenGames}
        showModCompatible={!p.showAllGames}
        onToggleModCompatible={() => p.setShowAllGames((v) => !v)}
        onAddGame={() => p.setShowAddModal(true)}
        onBackupClick={async () => {
          try {
            const status = await window.electron.backupGetStatus();
            if (status.loggedIn && status.provider) {
              p.setBackupProvider(status.provider);
              p.setShowBackupPanel(true);
            } else {
              p.setShowBackupModal(true);
            }
          } catch {
            p.setShowBackupModal(true);
          }
        }}
        handleSyncSteam={p.handleSyncSteam}
        syncing={p.syncing}
        syncLabel={p.syncLabel}
      />

      <div className="games__content">
        {p.showLoading && <GamesSkeleton />}

        {p.showEmpty && (
          <div className="games__empty">
            <h3>Nenhum jogo encontrado</h3>
            <p>Sua biblioteca Steam será escaneada automaticamente. Adicione jogos personalizados ou sincronize sua Steam.</p>
          </div>
        )}

        {p.showNoSearchResults && (
          <div className="games__empty">
            <h3>Nenhum resultado para "{p.searchQuery}"</h3>
            <p>Verifique a ortografia ou tente termos diferentes.</p>
          </div>
        )}

        {p.hasSteamGames && (
          <GamesSteamSection
            games={p.filteredSteam}
            viewMode={p.viewMode}
            selectedSteamGame={p.selectedSteamGame}
            launchingGameIds={p.launchingGameIds}
            erroredImages={p.erroredImages}
            onPlay={p.handlePlaySteam}
            onSelect={p.handleSelectSteamGame}
            onContextMenu={p.handleOpenSteamContextMenu}
            onImageError={p.handleImageError}
          />
        )}

        {p.hasLibrarySteamGames && (
          <GamesLocalSection
            title="Steam (Biblioteca)"
            games={p.librarySteamGames}
            viewMode={p.viewMode}
            selectedGame={p.selectedGame}
            launchingGameIds={p.launchingGameIds}
            erroredImages={p.erroredImages}
            onPlay={p.playGame}
            onSelect={p.handleSelectGame}
            onContextMenu={p.handleOpenContextMenu}
            onImageError={p.handleImageError}
          />
        )}

        {p.hasLocalGames && (
          <GamesLocalSection
            games={p.localGames}
            viewMode={p.viewMode}
            selectedGame={p.selectedGame}
            launchingGameIds={p.launchingGameIds}
            erroredImages={p.erroredImages}
            onPlay={p.playGame}
            onSelect={p.handleSelectGame}
            onContextMenu={p.handleOpenContextMenu}
            onImageError={p.handleImageError}
          />
        )}
      </div>

      {p.activeGame && (
        <GamesGameBar
          activeGame={p.activeGame}
          isRunning={p.isRunning}
          clearingPrefix={p.clearingPrefix}
          isSteamActive={p.isSteamActive}
          selectedSteamGame={p.selectedSteamGame}
          selectedGame={p.selectedGame}
          onPlaySteam={p.handlePlaySteam}
          onPlayLocal={p.playGame}
          onStop={p.stopGame}
          onConfigureSteam={p.handleConfigureSteamGame}
          onConfigureLocal={p.handleConfigureGame}
          onAddToSteam={p.addToSteam}
          onRevealFolder={p.revealFolder}
          onRevealWinePrefix={p.revealWinePrefix}
          onOpenExternal={window.electron.openExternal}
          onClearSteamPrefix={p.handleClearSteamPrefix}
          onClearLocalPrefix={p.handleClearLocalPrefix}
          onDelete={() => p.setShowDeleteModal(true)}
          onDuplicate={p.duplicateGame}
          onCreateShortcut={p.createShortcut}
          onHide={p.hideGame}
          onFavoriteSteam={p.handleFavoriteSteam}
          onFavoriteLocal={p.favoriteGame}
          onWineTool={p.handleWineTool}
        />
      )}

      {p.gameContextMenu.game && (
        <GameContextMenu
          game={p.gameContextMenu.game as unknown as LibraryGame}
          visible={p.gameContextMenu.visible}
          position={p.gameContextMenu.position}
          onClose={p.handleCloseContextMenu}
          isCustomGame={true}
          onOpenWineConfig={() => {
            p.setSelectedGame(p.gameContextMenu.game);
            p.setShowConfigModal(true);
          }}
        />
      )}

      <GamesPageModals
        showAddModal={p.showAddModal}
        showConfigModal={p.showConfigModal}
        showDeleteModal={p.showDeleteModal}
        showBackupModal={p.showBackupModal}
        showBackupPanel={p.showBackupPanel}
        backupProvider={p.backupProvider}
        dllCheckModal={p.dllCheckModal}
        selectedGame={p.selectedGame}
        onCloseAdd={() => p.setShowAddModal(false)}
        onGameAdded={p.loadGames}
        onCloseConfig={() => {
          p.setShowConfigModal(false);
          p.setSelectedGame(null);
        }}
        onSaveConfig={p.handleSaveGameConfig}
        onCloseDelete={() => p.setShowDeleteModal(false)}
        onDeleteGameOnly={() => {
          if (p.selectedGame) {
            p.deleteGame(p.selectedGame);
            p.setShowDeleteModal(false);
          }
        }}
        onDeleteGameAndPrefix={() => {
          if (p.selectedGame) {
            p.deleteGameWithPrefix(p.selectedGame);
            p.setShowDeleteModal(false);
          }
        }}
        onCloseDllCheck={() =>
          p.setDllCheckModal({ open: false, loading: false, result: null })
        }
        onCloseBackup={() => p.setShowBackupModal(false)}
        onBackupLoginSuccess={(provider) => p.setBackupProvider(provider)}
        onCloseBackupPanel={() => p.setShowBackupPanel(false)}
        onBackupLogout={() => p.setBackupProvider(null)}
        onBackupRestore={() => {
          p.updateLibrary();
          p.loadGames();
        }}
      />
    </div>
  );
}

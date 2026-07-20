import { gamesService, type GameConfig } from "@provision/AddGame/games-service";
import type { SteamInstalledGame } from "@types";

interface SaveGameConfigParams {
  updatedGame: GameConfig;
  clearPrefix?: boolean;
  onSteamGamesUpdate: React.Dispatch<React.SetStateAction<SteamInstalledGame[]>>;
  onLoadGames: () => void;
  onError: (title: string, msg: string) => void;
}

export async function saveGameConfig({
  updatedGame,
  clearPrefix,
  onSteamGamesUpdate,
  onLoadGames,
  onError,
}: SaveGameConfigParams): Promise<void> {
  try {
    if (updatedGame.shop === "steam") {
      const appId = updatedGame.objectId.replace("steam_", "");
      const execPath = (updatedGame.executablePath || "").trim();
      const protonPath = updatedGame.protonPath || "";
      const useCustomLaunch = !!((protonPath || updatedGame.winePrefixPath || execPath) && execPath);
      const steamConfig = {
        title: updatedGame.title,
        protonPath,
        winePrefixPath: updatedGame.winePrefixPath || "",
        executablePath: execPath,
        launchOptions: updatedGame.launchOptions || updatedGame.gameArgs || "",
        useCustomLaunch,
        autoRunMangohud: updatedGame.autoRunMangohud ?? updatedGame.mangoHud ?? false,
        autoRunGamemode: updatedGame.autoRunGamemode ?? updatedGame.gameMode ?? false,
        dxvk: updatedGame.dxvk || false,
        esync: updatedGame.esync || false,
        fsync: updatedGame.fsync || false,
        enableEac: updatedGame.enableEac || false,
        enableBattlEye: updatedGame.enableBattlEye || false,
        env: updatedGame.env || {},
      };
      await window.electron.setSteamGameConfig(appId, steamConfig);

      const selectedProtonName = updatedGame.protonVersion;
      const protonValue = selectedProtonName ? selectedProtonName : null;
      await window.electron.setSteamGameProton(appId, protonValue);

      if (clearPrefix) {
        const cleared = await window.electron.clearSteamPrefix(appId, selectedProtonName || undefined);
        if (cleared) {
          onSteamGamesUpdate((prev) =>
            prev.map((g) =>
              g.appId === appId ? { ...g, hasPrefix: false } : g
            )
          );
        }
      }
    } else {
      await gamesService.update(updatedGame);
      onLoadGames();
    }
  } catch (error) {
    console.error("Failed to save game config:", error);
    onError(
      "Erro ao salvar",
      "Não foi possível salvar as configurações do jogo."
    );
  }
}

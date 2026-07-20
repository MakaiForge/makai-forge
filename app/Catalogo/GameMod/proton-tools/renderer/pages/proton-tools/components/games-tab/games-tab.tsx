import { useTranslation } from "react-i18next";
import { useGamesTab } from "../../hooks/useGamesTab";
import { PrefixProgressModal } from "../prefix-progress-modal/prefix-progress-modal";
import "./games-tab.scss";

export function GamesTab() {
  const { t } = useTranslation("proton_tools");
  const p = useGamesTab();

  const modalAppId = p.changing || p.modalResult?.appId || null;
  const modalGame = modalAppId ? p.games.find((g) => g.appId === modalAppId) : null;

  return (
    <div className="proton-tools__content">
      <div className="proton-tools__section">
        <div className="games-tab__header">
          <h3>{t("steam_games")} ({p.games.length})</h3>
          <button
            className="games-tab__sync-btn"
            onClick={p.load}
            disabled={p.syncing}
          >
            {p.syncing ? t("syncing") : t("sync")}
          </button>
        </div>

        {p.status && !p.changing && !p.modalResult && (
          <div
            className="games-tab__status"
            style={{
              background: p.status.ok
                ? "rgba(80,200,80,0.15)"
                : "rgba(255,80,80,0.2)",
              borderColor: p.status.ok
                ? "rgba(80,200,80,0.3)"
                : "rgba(255,80,80,0.3)",
              color: p.status.ok ? "#8f8" : "#f88",
            }}
          >
            {p.status.msg}
          </div>
        )}

        {p.games.length === 0 && !p.syncing && (
          <div className="games-tab__empty">
            {t("no_steam_games")}
          </div>
        )}

        {p.games.map((game) => (
          <div key={game.appId} className="games-tab__game">
            <div className="games-tab__game-info">
              <div className="games-tab__game-name">{game.name}</div>
              <div className="games-tab__game-meta">
                AppID: {game.appId}
                {game.hasPrefix && <> &middot; Prefixo: OK</>}
                {game.compatDataPath && (
                  <> &middot; {game.compatDataPath}</>
                )}
              </div>
            </div>

            <select
              className="games-tab__proton-select"
              value={p.gameProtons[game.appId] || ""}
              onChange={(e) =>
                p.handleChangeProton(game.appId, e.target.value)
              }
              disabled={p.changing === game.appId}
            >
              <option value="">{t("undefined_steam_default")}</option>
              {p.protonVersions
                .filter((pv) => pv.isInstalled)
                .map((pv) => (
                <option
                  key={pv.path}
                  value={pv.path.split("/").pop() || pv.name}
                >
                  {pv.name}
                </option>
              ))}
            </select>

            {p.changing === game.appId && (
              <span className="games-tab__changing">
                {p.progressMsg[game.appId]
                  ? p.progressMsg[game.appId].split("\n").filter(Boolean).slice(-1)[0]
                  : "⏳..."
                }
              </span>
            )}
          </div>
        ))}
      </div>

      {modalGame && (p.changing || p.modalResult) && (
        <PrefixProgressModal
          gameName={modalGame.name}
          progressMsg={p.progressMsg[modalAppId!] || ""}
          result={p.modalResult}
          onClose={p.closeModal}
        />
      )}
    </div>
  );
}

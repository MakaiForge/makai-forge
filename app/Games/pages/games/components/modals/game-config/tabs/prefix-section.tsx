import { TextField } from "@components";
import type { ProtonVersion } from "@types";
import type { GameConfig } from "@games-ui/AddGame/games-service";
import type { SectionProps } from "../index";

interface PrefixSectionProps extends SectionProps {
  protonVersions: ProtonVersion[];
  currentSteamProton: string;
  isSteamGame: boolean;
  clearPrefix: boolean;
  onClearPrefixChange: (v: boolean) => void;
  onSelectPrefix: () => void;
}

export function PrefixSection({
  formData,
  handleChange,
  protonVersions,
  currentSteamProton,
  isSteamGame,
  clearPrefix,
  onClearPrefixChange,
  onSelectPrefix,
}: PrefixSectionProps) {
  return (
    <div className="game-config-modal__section">
      <h3>Wine Prefix & Proton</h3>

      <div className="game-config-modal__input-group">
        <div className="game-config-modal__field">
          <label>Prefix Path</label>
          <TextField
            value={formData.prefix || ""}
            onChange={(e) => handleChange("prefix", e.target.value)}
            placeholder="/home/user/Games/Makai-forger/game-name"
          />
        </div>
        <button
          type="button"
          className="game-config-modal__file-button"
          onClick={onSelectPrefix}
          title="Select prefix directory"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </button>
      </div>

      <div className="game-config-modal__field">
        <label>Proton Version</label>
        {protonVersions.length > 0 ? (
          <select
            value={formData.protonVersion || ""}
            onChange={(e) => handleChange("protonVersion", e.target.value)}
            className="game-config-modal__select"
          >
            <option value="">
              {isSteamGame
                ? "Undefined (Steam Default)"
                : "Default (System)"}
            </option>
            {protonVersions.filter((v) => v.isInstalled).map((proton) => (
              <option
                key={proton.path}
                value={proton.path.split("/").pop() || proton.name}
              >
                {proton.name}
              </option>
            ))}
          </select>
        ) : (
          <TextField
            value={formData.protonVersion || ""}
            onChange={(e) => handleChange("protonVersion", e.target.value)}
            placeholder="proton-EM-10.0-37-HDR"
          />
        )}
      </div>

      {currentSteamProton && (
        <div className="game-config-modal__current-info">
          Proton atual no Steam: <strong>{currentSteamProton}</strong>
        </div>
      )}

      {isSteamGame && (
        <label className="game-config-modal__checkbox game-config-modal__checkbox--steam">
          <input
            type="checkbox"
            checked={clearPrefix}
            onChange={(e) => onClearPrefixChange(e.target.checked)}
          />
          Limpar prefixo ao salvar (recria na próxima execução)
        </label>
      )}
    </div>
  );
}

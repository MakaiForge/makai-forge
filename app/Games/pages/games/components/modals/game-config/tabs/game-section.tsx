import { TextField } from "@components";
import type { GameConfig } from "@games-ui/AddGame/games-service";
import type { SectionProps } from "../index";

interface GameSectionProps extends SectionProps {
  onSelectExecutable: () => void;
}

export function GameSection({
  formData,
  handleChange,
  onSelectExecutable,
}: GameSectionProps) {
  return (
    <div className="game-config-modal__section">
      <h3>Game</h3>

      <div className="game-config-modal__field">
        <label>Name</label>
        <TextField
          value={formData.title || ""}
          onChange={(e) => handleChange("title", e.target.value)}
        />
      </div>

      <div className="game-config-modal__input-group">
        <div className="game-config-modal__field">
          <label>Executable</label>
          <TextField
            value={formData.executablePath || ""}
            onChange={(e) => handleChange("executablePath", e.target.value)}
            placeholder="/path/to/game.exe"
          />
        </div>
        <button
          type="button"
          className="game-config-modal__file-button"
          onClick={onSelectExecutable}
          title="Select executable"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </button>
      </div>

      <div className="game-config-modal__field">
        <label>Runner</label>
        <select
          value={formData.runner || "proton"}
          onChange={(e) => handleChange("runner", e.target.value)}
          className="game-config-modal__select"
        >
          <option value="proton">Proton (Wine)</option>
          <option value="wine">Wine</option>
          <option value="steam">Steam</option>
        </select>
      </div>
    </div>
  );
}

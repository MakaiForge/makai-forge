import { TextField } from "@renderer/components";
import type { SectionProps } from "../index";

export function ArgumentsSection({ formData, handleChange }: SectionProps) {
  return (
    <div className="game-config-modal__section">
      <h3>Arguments</h3>

      <div className="game-config-modal__field">
        <label>Game Arguments</label>
        <TextField
          value={formData.gameArgs || ""}
          onChange={(e) => handleChange("gameArgs", e.target.value)}
          placeholder="-no-browser -skipintro"
        />
      </div>

      <div className="game-config-modal__field">
        <label>Pre-launch Command</label>
        <TextField
          value={formData.prelaunchCommand || ""}
          onChange={(e) => handleChange("prelaunchCommand", e.target.value)}
          placeholder="Commands to run before game starts"
        />
      </div>

      <div className="game-config-modal__field">
        <label>Post-exit Command</label>
        <TextField
          value={formData.postexitCommand || ""}
          onChange={(e) => handleChange("postexitCommand", e.target.value)}
          placeholder="Commands to run after game exits"
        />
      </div>
    </div>
  );
}

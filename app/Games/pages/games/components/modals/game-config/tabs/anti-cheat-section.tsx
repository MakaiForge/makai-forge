import type { SectionProps } from "../index";

export function AntiCheatSection({ formData, handleChange }: SectionProps) {
  return (
    <div className="game-config-modal__section">
      <h3>Anti-Cheat</h3>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="enableEac"
          checked={formData.enableEac || false}
          onChange={(e) => handleChange("enableEac", e.target.checked)}
        />
        <label htmlFor="enableEac">Enable Easy Anti-Cheat (EAC)</label>
      </div>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="enableBattlEye"
          checked={formData.enableBattlEye || false}
          onChange={(e) => handleChange("enableBattlEye", e.target.checked)}
        />
        <label htmlFor="enableBattlEye">Enable BattlEye (Beta)</label>
      </div>
    </div>
  );
}

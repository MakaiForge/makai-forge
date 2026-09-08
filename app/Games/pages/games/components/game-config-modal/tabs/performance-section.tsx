import type { SectionProps } from "../index";

export function PerformanceSection({ formData, handleChange }: SectionProps) {
  return (
    <div className="game-config-modal__section">
      <h3>Performance</h3>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="esync"
          checked={formData.esync || false}
          onChange={(e) => handleChange("esync", e.target.checked)}
        />
        <label htmlFor="esync">Enable ESYNC</label>
      </div>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="fsync"
          checked={formData.fsync || false}
          onChange={(e) => handleChange("fsync", e.target.checked)}
        />
        <label htmlFor="fsync">Enable FSYNC</label>
      </div>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="mangoHud"
          checked={formData.mangoHud || false}
          onChange={(e) => handleChange("mangoHud", e.target.checked)}
        />
        <label htmlFor="mangoHud">Enable MangoHud</label>
      </div>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="gameMode"
          checked={formData.gameMode || false}
          onChange={(e) => handleChange("gameMode", e.target.checked)}
        />
        <label htmlFor="gameMode">Enable GameMode</label>
      </div>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="threadedD3D"
          checked={formData.threadedD3D || false}
          onChange={(e) => handleChange("threadedD3D", e.target.checked)}
        />
        <label htmlFor="threadedD3D">Enable Threaded D3D</label>
      </div>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="preferSystemLibs"
          checked={formData.preferSystemLibs || false}
          onChange={(e) => handleChange("preferSystemLibs", e.target.checked)}
        />
        <label htmlFor="preferSystemLibs">Prefer System Libraries</label>
      </div>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="esyncManual"
          checked={formData.esyncManual || false}
          onChange={(e) => handleChange("esyncManual", e.target.checked)}
        />
        <label htmlFor="esyncManual">Force ESYNC (Manual)</label>
      </div>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="fsyncManual"
          checked={formData.fsyncManual || false}
          onChange={(e) => handleChange("fsyncManual", e.target.checked)}
        />
        <label htmlFor="fsyncManual">Force FSYNC (Manual)</label>
      </div>
    </div>
  );
}

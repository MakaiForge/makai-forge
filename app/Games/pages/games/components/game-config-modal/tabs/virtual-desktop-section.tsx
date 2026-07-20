import { TextField } from "@renderer/components";
import type { SectionProps } from "../index";

export function VirtualDesktopSection({
  formData,
  handleChange,
}: SectionProps) {
  return (
    <div className="game-config-modal__section">
      <h3>Virtual Desktop</h3>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="virtualDesktop"
          checked={formData.virtualDesktop || false}
          onChange={(e) => handleChange("virtualDesktop", e.target.checked)}
        />
        <label htmlFor="virtualDesktop">Enable Virtual Desktop</label>
      </div>

      {formData.virtualDesktop && (
        <div className="game-config-modal__field">
          <label>Virtual Desktop Resolution</label>
          <select
            value={formData.wineDesktop || ""}
            onChange={(e) => handleChange("wineDesktop", e.target.value)}
            className="game-config-modal__select"
          >
            <option value="">Default</option>
            <option value="1920x1080">1920x1080</option>
            <option value="1280x720">1280x720</option>
            <option value="2560x1440">2560x1440</option>
            <option value="3840x2160">3840x2160</option>
          </select>
        </div>
      )}

      <h3 style={{ marginTop: "1rem" }}>DPI & Mouse</h3>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="dpiScaling"
          checked={formData.dpiScaling || false}
          onChange={(e) => handleChange("dpiScaling", e.target.checked)}
        />
        <label htmlFor="dpiScaling">Enable DPI Scaling</label>
      </div>

      {formData.dpiScaling && (
        <div className="game-config-modal__field">
          <label>DPI Value</label>
          <TextField
            value={formData.explicitDpi || ""}
            onChange={(e) => handleChange("explicitDpi", e.target.value)}
            placeholder="96"
          />
        </div>
      )}

      <div className="game-config-modal__field">
        <label>Mouse Warp Override</label>
        <select
          value={formData.mouseWarpOverride || "enable"}
          onChange={(e) => handleChange("mouseWarpOverride", e.target.value)}
          className="game-config-modal__select"
        >
          <option value="enable">Enable (Default)</option>
          <option value="disable">Disable</option>
          <option value="force">Force</option>
        </select>
      </div>
    </div>
  );
}

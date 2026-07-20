import { TextField } from "@renderer/components";
import type { SectionProps } from "../index";

export function GraphicsSection({ formData, handleChange }: SectionProps) {
  return (
    <div className="game-config-modal__section">
      <h3>Graphics</h3>

      <div className="game-config-modal__field">
        <label>Resolution</label>
        <TextField
          value={formData.resolution || ""}
          onChange={(e) => handleChange("resolution", e.target.value)}
          placeholder="1920x1080"
        />
      </div>

      <div className="game-config-modal__field">
        <label>FPS Limit</label>
        <TextField
          value={formData.fpsLimit || ""}
          onChange={(e) => handleChange("fpsLimit", e.target.value)}
          placeholder="60"
        />
      </div>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="dxvk"
          checked={formData.dxvk || false}
          onChange={(e) => handleChange("dxvk", e.target.checked)}
        />
        <label htmlFor="dxvk">Enable DXVK</label>
      </div>

      <div className="game-config-modal__field">
        <label>DXVK Version</label>
        <select
          value={formData.dxvkVersion || ""}
          onChange={(e) => handleChange("dxvkVersion", e.target.value)}
          className="game-config-modal__select"
        >
          <option value="">Default (Latest)</option>
          <option value="dxvk-2.4">DXVK 2.4</option>
          <option value="dxvk-2.3">DXVK 2.3</option>
          <option value="dxvk-2.2">DXVK 2.2</option>
          <option value="dxvk-2.1">DXVK 2.1</option>
          <option value="dxvk-2.0">DXVK 2.0</option>
          <option value="dxvk-1.10">DXVK 1.10</option>
        </select>
      </div>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="vulkan"
          checked={formData.vulkan || false}
          onChange={(e) => handleChange("vulkan", e.target.checked)}
        />
        <label htmlFor="vulkan">Enable Vulkan (if DXVK disabled)</label>
      </div>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="vkd3d"
          checked={formData.vkd3d || false}
          onChange={(e) => handleChange("vkd3d", e.target.checked)}
        />
        <label htmlFor="vkd3d">Enable VKD3D (DXVK for Vulkan)</label>
      </div>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="textures"
          checked={formData.textures || false}
          onChange={(e) => handleChange("textures", e.target.checked)}
        />
        <label htmlFor="textures">
          Enable textures (Large Address Aware)
        </label>
      </div>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="dxvkAsync"
          checked={formData.dxvkAsync || false}
          onChange={(e) => handleChange("dxvkAsync", e.target.checked)}
        />
        <label htmlFor="dxvkAsync">Enable DXVK Async</label>
      </div>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="amdFsr"
          checked={formData.amdFsr || false}
          onChange={(e) => handleChange("amdFsr", e.target.checked)}
        />
        <label htmlFor="amdFsr">Enable AMD FSR</label>
      </div>

      {formData.amdFsr && (
        <div className="game-config-modal__field">
          <label>AMD FSR Sharpness</label>
          <select
            value={formData.amdFsrSharpness || "2"}
            onChange={(e) => handleChange("amdFsrSharpness", e.target.value)}
            className="game-config-modal__select"
          >
            <option value="0">0 (Sharpest)</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5 (Smoothest)</option>
          </select>
        </div>
      )}

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="superResolution"
          checked={formData.superResolution || false}
          onChange={(e) => handleChange("superResolution", e.target.checked)}
        />
        <label htmlFor="superResolution">Enable FSR Super Resolution</label>
      </div>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="fluidResolution"
          checked={formData.fluidResolution || false}
          onChange={(e) => handleChange("fluidResolution", e.target.checked)}
        />
        <label htmlFor="fluidResolution">
          Fluid Resolution (Unlock frame rate)
        </label>
      </div>

      <div className="game-config-modal__field">
        <label>VKD3D Version</label>
        <select
          value={formData.vkd3dVersion || ""}
          onChange={(e) => handleChange("vkd3dVersion", e.target.value)}
          className="game-config-modal__select"
        >
          <option value="">Default (Latest)</option>
          <option value="vkd3d-2.10">VKD3D 2.10</option>
          <option value="vkd3d-2.9">VKD3D 2.9</option>
          <option value="vkd3d-2.8">VKD3D 2.8</option>
          <option value="vkd3d-2.7">VKD3D 2.7</option>
        </select>
      </div>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="d3dExtras"
          checked={formData.d3dExtras || false}
          onChange={(e) => handleChange("d3dExtras", e.target.checked)}
        />
        <label htmlFor="d3dExtras">
          Enable D3D Extras (DXVK companion)
        </label>
      </div>

      <div className="game-config-modal__field">
        <label>Graphics Backend</label>
        <select
          value={formData.graphicsBackend || "auto"}
          onChange={(e) => handleChange("graphicsBackend", e.target.value)}
          className="game-config-modal__select"
        >
          <option value="auto">Auto</option>
          <option value="wayland">Wayland</option>
          <option value="x11">X11</option>
        </select>
      </div>
    </div>
  );
}

import type { SectionProps } from "../index";

export function VideoSection({ formData, handleChange }: SectionProps) {
  return (
    <div className="game-config-modal__section">
      <h3>Video</h3>

      <div className="game-config-modal__field">
        <label>VSync</label>
        <select
          value={formData.vsync || "1"}
          onChange={(e) => handleChange("vsync", e.target.value)}
          className="game-config-modal__select"
        >
          <option value="0">Off</option>
          <option value="1">On</option>
          <option value="-1">Auto</option>
        </select>
      </div>

      <div className="game-config-modal__field">
        <label>Rendering Mode</label>
        <select
          value={formData.renderingMode || ""}
          onChange={(e) => handleChange("renderingMode", e.target.value)}
          className="game-config-modal__select"
        >
          <option value="">Default</option>
          <option value="opengl">OpenGL</option>
          <option value="directx">DirectX</option>
          <option value="vulkan">Vulkan</option>
        </select>
      </div>

      <div className="game-config-modal__field">
        <label>Video Driver</label>
        <select
          value={formData.videoDriver || ""}
          onChange={(e) => handleChange("videoDriver", e.target.value)}
          className="game-config-modal__select"
        >
          <option value="">Default</option>
          <option value="nvidia">NVIDIA</option>
          <option value="amd">AMD</option>
          <option value="intel">Intel</option>
        </select>
      </div>

      <div className="game-config-modal__field">
        <label>Frame Throttle</label>
        <select
          value={formData.frameThrottle || ""}
          onChange={(e) => handleChange("frameThrottle", e.target.value)}
          className="game-config-modal__select"
        >
          <option value="">Default</option>
          <option value="0">Disabled</option>
          <option value="1">Enabled</option>
          <option value="2">Sleep</option>
        </select>
      </div>
    </div>
  );
}

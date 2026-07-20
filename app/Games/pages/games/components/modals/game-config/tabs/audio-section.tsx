import type { SectionProps } from "../index";

export function AudioSection({ formData, handleChange }: SectionProps) {
  return (
    <div className="game-config-modal__section">
      <h3>Audio</h3>

      <div className="game-config-modal__field">
        <label>Audio Driver</label>
        <select
          value={formData.audioDriver || ""}
          onChange={(e) => handleChange("audioDriver", e.target.value)}
          className="game-config-modal__select"
        >
          <option value="">Default</option>
          <option value="alsa">ALSA</option>
          <option value="pulse">PulseAudio</option>
          <option value="oss">OSS</option>
        </select>
      </div>

      <div className="game-config-modal__field">
        <label>Channels</label>
        <select
          value={formData.audioChannels || ""}
          onChange={(e) => handleChange("audioChannels", e.target.value)}
          className="game-config-modal__select"
        >
          <option value="">Default</option>
          <option value="2">Stereo (2.0)</option>
          <option value="5.1">5.1 Surround</option>
          <option value="7.1">7.1 Surround</option>
        </select>
      </div>

      <div className="game-config-modal__field">
        <label>Sample Rate</label>
        <select
          value={formData.audioSampleRate || ""}
          onChange={(e) => handleChange("audioSampleRate", e.target.value)}
          className="game-config-modal__select"
        >
          <option value="">Default</option>
          <option value="44100">44100 Hz</option>
          <option value="48000">48000 Hz</option>
          <option value="96000">96000 Hz</option>
        </select>
      </div>

      <div className="game-config-modal__checkbox">
        <input
          type="checkbox"
          id="audioInBackground"
          checked={formData.audioInBackground || false}
          onChange={(e) => handleChange("audioInBackground", e.target.checked)}
        />
        <label htmlFor="audioInBackground">
          Keep Audio Running in Background
        </label>
      </div>
    </div>
  );
}

import { useState, useCallback, useRef, useEffect } from "react";
import { TextField, Button, Toast, Modal } from "@renderer/components";
import type { GameConfig } from "@games-ui/AddGame/games-service";
import type { SectionProps } from "../index";

const LIBRARIES_LIST = [
  { id: "vcrun", name: "VC++ Redist", desc: "2005-2022" },
  { id: "physx", name: "NVIDIA PhysX", desc: "PhysX System" },
  { id: "binkw32", name: "Bink Video", desc: "Video decoder" },
  { id: "d3dx11_43", name: "D3DX11_43", desc: "DirectX 11 aux" },
  { id: "d3dx9", name: "D3DX9", desc: "DirectX 9 Runtime" },
  { id: "xact", name: "XAudio2", desc: "DirectX Audio" },
  { id: "webview2", name: "WebView2", desc: "Edge Runtime" },
  { id: "dotnet35", name: ".NET 3.5 SP1", desc: "Framework 3.5" },
  { id: "dotnet48", name: ".NET 4.8", desc: "Framework 4.8" },
  { id: "xna40", name: "XNA 4.0", desc: "XNA Framework" },
] as const;

interface AdvancedSectionProps extends SectionProps {
  dllCheckLoading: boolean;
  dllCheckResult: string | null;
  hasProton: boolean;
  onCheckDlls: () => void;
  onEnvChange: (key: string, value: string) => void;
  shop?: string;
  objectId?: string;
}

export function AdvancedSection({
  formData,
  handleChange,
  dllCheckLoading,
  dllCheckResult,
  hasProton,
  onCheckDlls,
  onEnvChange,
  shop,
  objectId,
}: AdvancedSectionProps) {
  const [libraryStates, setLibraryStates] = useState<
    Record<string, "idle" | "busy" | "done" | "error">
  >({});
  const [x11Busy, setX11Busy] = useState(false);

  const [toast, setToast] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    type: "success" | "error" | "warning";
  }>({ visible: false, title: "", type: "success" });

  const [progressVisible, setProgressVisible] = useState(false);
  const [progressPhase, setProgressPhase] = useState(0);
  const [progressResult, setProgressResult] = useState<
    "pending" | "success" | "error"
  >("pending");
  const [progressError, setProgressError] = useState("");

  const PHASES = [
    "Downloading installer from GitHub...",
    "Extracting files from NSIS archive...",
    "Copying DLLs to Wine prefix...",
  ];

  const PHASE_MAP: Record<string, number> = {
    download: 0,
    extract: 1,
    done: 2,
    error: 2,
  };

  const handleCloseToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleInstallLibrary = async (libId: string) => {
    if (!shop || !objectId) return;
    setProgressVisible(true);
    setProgressPhase(0);
    setProgressResult("pending");
    setProgressError("");
    setLibraryStates((prev) => ({ ...prev, [libId]: "busy" }));

    const unsubProgress = window.electron.onLibraryInstallProgress(
      (data) => {
        if (data.libraryId === libId && PHASE_MAP[data.phase] !== undefined) {
          setProgressPhase(PHASE_MAP[data.phase]);
        }
      }
    );

    try {
      const result = await window.electron.installLibrary(
        shop,
        objectId,
        libId
      );

      unsubProgress();

      setLibraryStates((prev) => ({
        ...prev,
        [libId]: result.success ? "done" : "error",
      }));

      if (result.success) {
        setProgressPhase(2);
        setProgressResult("success");
        setTimeout(() => setProgressVisible(false), 2000);
        showToast("success", `${libId} installed`);
      } else {
        setProgressResult("error");
        setProgressError(result.error || "Unknown error");
        showToast("error", `${libId} failed`, result.error || "Unknown error");
      }
    } catch (err) {
      unsubProgress();
      setLibraryStates((prev) => ({ ...prev, [libId]: "error" }));
      setProgressResult("error");
      setProgressError(String(err));
      showToast("error", `${libId} failed`, String(err));
    }
  };

  const showToast = (
    type: "success" | "error" | "warning",
    title: string,
    message?: string
  ) => setToast({ visible: true, type, title, message });

  const x11Active =
    formData.graphicsBackend === "x11" &&
    formData.env?.SDL_VIDEO_DRIVER === "x11";

  const handleToggleX11 = async () => {
    if (x11Active) {
      const newEnv = { ...formData.env };
      delete newEnv.SDL_VIDEO_DRIVER;
      delete newEnv.DISPLAY;
      handleChange("env", newEnv);
      handleChange("graphicsBackend", "auto");
      showToast("success", "X11 Mode disabled");
    } else {
      setX11Busy(true);
      try {
        const check = await window.electron.checkX11Support();
        if (!check.installed) {
          await window.electron.installX11Support();
        }
      } catch {
        // non-blocking
      }
      setX11Busy(false);
      handleChange("graphicsBackend", "x11");
      onEnvChange("SDL_VIDEO_DRIVER", "x11");
      onEnvChange("DISPLAY", ":0");
      showToast(
        "success",
        "X11 Mode enabled",
        "SDL_VIDEO_DRIVER=x11, DISPLAY=:0"
      );
    }
  };

  return (
    <>
      <div className="game-config-modal__section">
        <h3>Libraries</h3>

        <div className="game-config-modal__field">
          <label>DLL Overrides</label>
          <TextField
            value={formData.dllOverrides || ""}
            onChange={(e) => handleChange("dllOverrides", e.target.value)}
            placeholder="e.g., d3dx9_43=n;winemenubuilder=n"
          />
        </div>

        <div className="game-config-modal__field">
          <label>Winetricks (comma-separated)</label>
          <TextField
            value={formData.winetricks || ""}
            onChange={(e) => handleChange("winetricks", e.target.value)}
            placeholder="e.g., d3dcompiler_43,fontsmooth=rgb"
          />
        </div>

        <div className="game-config-modal__field" style={{ marginTop: 12 }}>
          <Button
            onClick={onCheckDlls}
            disabled={dllCheckLoading || !hasProton}
            theme="primary"
          >
            {dllCheckLoading ? "Verificando..." : "Verificar DLLs Faltantes"}
          </Button>
          {dllCheckResult && (
            <p
              style={{
                marginTop: 8,
                fontSize: 12,
                color: dllCheckResult.startsWith("Erro") ? "#e74c3c" : "#666",
              }}
            >
              {dllCheckResult}
            </p>
          )}
        </div>

        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          {LIBRARIES_LIST.map((lib) => {
            const state = libraryStates[lib.id] || "idle";
            return (
              <div key={lib.id} className="game-config-modal__library-item">
                <div className="game-config-modal__library-info">
                  <strong>{lib.name}</strong>
                  <span>{lib.desc}</span>
                </div>
                <button
                  type="button"
                  className={`game-config-modal__library-btn ${
                    state === "done"
                      ? "game-config-modal__library-btn--done"
                      : state === "error"
                        ? "game-config-modal__library-btn--error"
                        : ""
                  }`}
                  disabled={state === "busy" || state === "done"}
                  onClick={() => handleInstallLibrary(lib.id)}
                >
                  {state === "busy"
                    ? "..."
                    : state === "done"
                      ? "✓"
                      : state === "error"
                        ? "!"
                        : "Install"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="game-config-modal__section">
        <h3>X11 Mode</h3>
        <p style={{ fontSize: 12, color: "#8b8b96", marginBottom: 8 }}>
          Force this game to run in X11 instead of Wayland. Installs
          xorg-xwayland if missing.
        </p>

        {x11Busy && (
          <p style={{ fontSize: 12, color: "#f0c040", marginBottom: 8 }}>
            Installing X11 packages...
          </p>
        )}

        <div
          className="game-config-modal__field-row"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 4,
          }}
        >
          <label
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: x11Active ? "#2ecc71" : "#8b8b96",
              cursor: "pointer",
              userSelect: "none",
            }}
            onClick={handleToggleX11}
          >
            {x11Active ? "X11 Mode: ON" : "X11 Mode: OFF"}
          </label>
          <div
            onClick={handleToggleX11}
            style={{
              position: "relative",
              width: 44,
              height: 24,
              borderRadius: 12,
              backgroundColor: x11Active ? "#2ecc71" : "#444",
              cursor: "pointer",
              transition: "background-color 0.2s",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 2,
                left: x11Active ? 22 : 2,
                width: 20,
                height: 20,
                borderRadius: "50%",
                backgroundColor: "#fff",
                transition: "left 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }}
            />
          </div>
        </div>
      </div>

      <div className="game-config-modal__section">
        <h3>Language</h3>

        <div className="game-config-modal__field">
          <label>Language</label>
          <select
            value={formData.language || ""}
            onChange={(e) => handleChange("language", e.target.value)}
            className="game-config-modal__select"
          >
            <option value="">System Default</option>
            <option value="en_US">English (US)</option>
            <option value="en_GB">English (UK)</option>
            <option value="pt_BR">Portuguese (Brazil)</option>
            <option value="pt_PT">Portuguese (Portugal)</option>
            <option value="es_ES">Spanish</option>
            <option value="fr_FR">French</option>
            <option value="de_DE">German</option>
            <option value="it_IT">Italian</option>
            <option value="ja_JP">Japanese</option>
            <option value="ko_KR">Korean</option>
            <option value="zh_CN">Chinese (Simplified)</option>
            <option value="ru_RU">Russian</option>
          </select>
        </div>

        <div className="game-config-modal__field">
          <label>Locale</label>
          <TextField
            value={formData.locale || ""}
            onChange={(e) => handleChange("locale", e.target.value)}
            placeholder="e.g., en_US.UTF-8"
          />
        </div>
      </div>

      <div className="game-config-modal__section">
        <h3>Environment Variables</h3>
        {formData.env &&
          Object.entries(formData.env).map(([key, value]) => (
            <div key={key} className="game-config-modal__field-row">
              <TextField
                value={key}
                placeholder="KEY"
                onChange={(e) => {
                  const newEnv = { ...formData.env };
                  delete newEnv[key];
                  if (e.target.value && value) {
                    newEnv[e.target.value] = value;
                  }
                  handleChange("env", newEnv);
                }}
              />
              <TextField
                value={value}
                placeholder="VALUE"
                onChange={(e) => onEnvChange(key, e.target.value)}
              />
            </div>
          ))}
        <Button
          type="button"
          onClick={() =>
            handleChange("env", { ...formData.env, NEW_VAR: "" })
          }
          className="game-config-modal__add-env"
        >
          + Add Variable
        </Button>
      </div>

      <Modal
        visible={progressVisible}
        title="Installing Library"
        onClose={() => {
          if (progressResult !== "pending") setProgressVisible(false);
        }}
        clickOutsideToClose={progressResult !== "pending"}
      >
        <div style={{ padding: "16px 0", minWidth: 320 }}>
          {PHASES.map((phase, i) => {
            let icon: string;
            let color: string;

            if (progressResult === "success") {
              icon = "✓";
              color = "#2ecc71";
            } else if (progressResult === "error" && i === progressPhase) {
              icon = "✗";
              color = "#e74c3c";
            } else if (i < progressPhase) {
              icon = "✓";
              color = "#2ecc71";
            } else if (i === progressPhase) {
              icon = "◌";
              color = "#f0c040";
            } else {
              icon = "○";
              color = "#555";
            }

            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 0",
                  opacity: i <= progressPhase || progressResult !== "pending" ? 1 : 0.4,
                }}
              >
                <span
                  style={{
                    color,
                    fontSize: 16,
                    width: 20,
                    textAlign: "center",
                    animation:
                      progressResult === "pending" && i === progressPhase
                        ? "spin 1s linear infinite"
                        : "none",
                  }}
                >
                  {icon}
                </span>
                <span style={{ fontSize: 13, color: "#ddd" }}>{phase}</span>
              </div>
            );
          })}

          {progressResult === "success" && (
            <p
              style={{
                marginTop: 12,
                color: "#2ecc71",
                fontWeight: 600,
                textAlign: "center",
              }}
            >
              Library installed successfully!
            </p>
          )}

          {progressResult === "error" && (
            <div style={{ marginTop: 12 }}>
              <p style={{ color: "#e74c3c", fontWeight: 600 }}>
                Installation failed
              </p>
              <p style={{ color: "#999", fontSize: 12, marginTop: 4 }}>
                {progressError}
              </p>
              <div style={{ marginTop: 12, textAlign: "right" }}>
                <Button onClick={() => setProgressVisible(false)}>Close</Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Toast
        visible={toast.visible}
        title={toast.title}
        message={toast.message}
        type={toast.type}
        onClose={handleCloseToast}
      />
    </>
  );
}

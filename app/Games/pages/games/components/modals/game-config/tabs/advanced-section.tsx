import { useState, useCallback, useRef, useEffect } from "react";
import { TextField, Button, Toast, Modal } from "@components";
import type { GameConfig } from "@games-ui/AddGame/games-service";
import type { SectionProps } from "../index";

const LIBRARIES_LIST = [
  // VC++ Redists
  { id: "vcrun2005", name: "VC++ 2005", desc: "Visual C++ 2005 SP1" },
  { id: "vcrun2008", name: "VC++ 2008", desc: "Visual C++ 2008 SP1" },
  { id: "vcrun2010", name: "VC++ 2010", desc: "Visual C++ 2010 SP1" },
  { id: "vcrun2012", name: "VC++ 2012", desc: "Visual C++ 2012" },
  { id: "vcrun2013", name: "VC++ 2013", desc: "Visual C++ 2013" },
  { id: "vcrun2015", name: "VC++ 2015", desc: "Visual C++ 2015" },
  { id: "vcrun2019", name: "VC++ 2019", desc: "Visual C++ 2015-2022" },
  { id: "vcrun2022", name: "VC++ 2022", desc: "Visual C++ 2022" },
  { id: "vcrun", name: "VC++ All-in-one", desc: "2005-2022 bundle" },
  // .NET Framework
  { id: "dotnet35", name: ".NET 3.5 SP1", desc: "Framework 3.5" },
  { id: "dotnet40", name: ".NET 4.0", desc: "Framework 4.0" },
  { id: "dotnet48", name: ".NET 4.8", desc: "Framework 4.8" },
  // DirectX
  { id: "d3dx9", name: "D3DX9", desc: "DirectX 9 Runtime" },
  { id: "d3dx9_43", name: "D3DX9_43", desc: "DirectX 9 June 2010" },
  { id: "d3dx10", name: "D3DX10", desc: "DirectX 10 Runtime" },
  { id: "d3dx11_42", name: "D3DX11_42", desc: "DirectX 11 SDK" },
  { id: "d3dx11_43", name: "D3DX11_43", desc: "DirectX 11 aux" },
  // Wrappers
  { id: "dxvk", name: "DXVK", desc: "DirectX 9-11 → Vulkan" },
  { id: "vkd3d", name: "VKD3D", desc: "DirectX 12 → Vulkan" },
  // Media & Codecs
  { id: "allcodecs", name: "All Codecs", desc: "WMV, WMA, etc." },
  { id: "wmp9", name: "WMP 9", desc: "Windows Media Player 9" },
  { id: "wsh57", name: "WSH 5.7", desc: "Windows Script Host" },
  { id: "quartz", name: "Quartz", desc: "DirectShow filters" },
  // System
  { id: "directplay", name: "DirectPlay", desc: "Legacy multiplayer" },
  { id: "msls31", name: "MSLS31", desc: "Line Services 3.1" },
  { id: "amdkmt", name: "AMD KMT", desc: "AMD GPU driver helper" },
  // Gaming
  { id: "physx", name: "NVIDIA PhysX", desc: "PhysX SDK" },
  { id: "binkw32", name: "Bink Video", desc: "Bink video decoder" },
  { id: "xact", name: "XAudio2", desc: "DirectX Audio" },
  { id: "xna40", name: "XNA 4.0", desc: "XNA Framework" },
  { id: "webview2", name: "WebView2", desc: "Edge WebView2 Runtime" },
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
  const [x11ConfirmVisible, setX11ConfirmVisible] = useState(false);
  const [x11PendingActivate, setX11PendingActivate] = useState(false);

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
    formData.env?.SDL_VIDEO_DRIVER === "x11" &&
    formData.env?.XDG_SESSION_TYPE === "x11";

  const handleToggleX11 = async () => {
    if (x11Active) {
      const newEnv = { ...formData.env };
      delete newEnv.SDL_VIDEO_DRIVER;
      delete newEnv.DISPLAY;
      delete newEnv.XDG_SESSION_TYPE;
      delete newEnv.GDK_BACKEND;
      delete newEnv.QT_QPA_PLATFORM;
      delete newEnv.PROTON_ENABLE_WAYLAND;
      handleChange("env", newEnv);
      handleChange("graphicsBackend", "auto");
      showToast("success", "X11 Mode disabled");
    } else {
      setX11Busy(true);
      try {
        const check = await window.electron.checkX11Support();
        if (!check.installed) {
          setX11PendingActivate(true);
          setX11ConfirmVisible(true);
          return;
        }
      } catch {
        /* non-blocking */
      }
      setX11Busy(false);
      activateX11Mode();
    }
  };

  const activateX11Mode = () => {
    const newEnv = {
      ...formData.env,
      XDG_SESSION_TYPE: "x11",
      SDL_VIDEO_DRIVER: "x11",
      GDK_BACKEND: "x11",
      QT_QPA_PLATFORM: "x11",
      PROTON_ENABLE_WAYLAND: "0",
    };
    handleChange("env", newEnv);
    handleChange("graphicsBackend", "x11");
    showToast(
      "success",
      "X11 Mode enabled",
      "Forçando X11: SDL, GDK, QT, PROTON_ENABLE_WAYLAND=0"
    );
  };

  const handleConfirmInstallX11 = async () => {
    setX11ConfirmVisible(false);
    try {
      const result = await window.electron.installX11Support();
      if (!result.success) {
        showToast("error", "X11 install failed", "No terminal found");
      }
    } catch (err: any) {
      showToast("error", "X11 install failed", String(err));
    }
    setX11Busy(false);
    if (x11PendingActivate) {
      setX11PendingActivate(false);
      activateX11Mode();
    }
  };

  const handleCancelInstallX11 = () => {
    setX11ConfirmVisible(false);
    setX11PendingActivate(false);
    setX11Busy(false);
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
          xwayland if missing.
        </p>

        {x11Busy && (
          <p style={{ fontSize: 12, color: "#f0c040", marginBottom: 8 }}>
            Checking XWayland support...
          </p>
        )}

        <div className="game-config-modal__x11-toggle">
          <label
            className={`game-config-modal__x11-label ${x11Active ? "game-config-modal__x11-label--active" : "game-config-modal__x11-label--inactive"}`}
            onClick={handleToggleX11}
          >
            {x11Active ? "X11 Mode: ON" : "X11 Mode: OFF"}
          </label>
          <div
            className={`game-config-modal__x11-switch ${x11Active ? "game-config-modal__x11-switch--active" : "game-config-modal__x11-switch--inactive"}`}
            onClick={handleToggleX11}
          >
            <div
              className={`game-config-modal__x11-knob ${x11Active ? "game-config-modal__x11-knob--on" : "game-config-modal__x11-knob--off"}`}
            />
          </div>
        </div>
      </div>

      <Modal
        visible={x11ConfirmVisible}
        title="XWayland não encontrado"
        onClose={handleCancelInstallX11}
        clickOutsideToClose={false}
      >
        <div style={{ padding: "16px 0", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "#ddd", marginBottom: 16 }}>
            XWayland não está instalado no seu sistema.
            Deseja instalar?
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <Button onClick={handleCancelInstallX11} theme="outline">
              Cancelar
            </Button>
            <Button onClick={handleConfirmInstallX11} theme="primary">
              Instalar
            </Button>
          </div>
        </div>
      </Modal>

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

import { useState, useEffect, useRef } from "react";
import { Button } from "@components";
import type { ProtonVersion } from "@types";
import type { GameConfig } from "@games-ui/AddGame/games-service";
import { GameSection } from "./tabs/game-section";
import { PrefixSection } from "./tabs/prefix-section";
import { ArgumentsSection } from "./tabs/arguments-section";
import { GraphicsSection } from "./tabs/graphics-section";
import { PerformanceSection } from "./tabs/performance-section";
import { VideoSection } from "./tabs/video-section";
import { AntiCheatSection } from "./tabs/anti-cheat-section";
import { VirtualDesktopSection } from "./tabs/virtual-desktop-section";
import { AudioSection } from "./tabs/audio-section";
import { AdvancedSection } from "./tabs/advanced-section";
import "./game-config-modal.scss";

interface GameConfigModalProps {
  game: GameConfig | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (game: GameConfig, clearPrefix?: boolean) => void;
}

type TabId =
  | "game"
  | "prefix"
  | "arguments"
  | "graphics"
  | "performance"
  | "video"
  | "anti-cheat"
  | "virtual-desktop"
  | "audio"
  | "advanced";

const TABS: { id: TabId; label: string }[] = [
  { id: "game", label: "Game" },
  { id: "prefix", label: "Prefix & Proton" },
  { id: "arguments", label: "Arguments" },
  { id: "graphics", label: "Graphics" },
  { id: "performance", label: "Performance" },
  { id: "video", label: "Video" },
  { id: "anti-cheat", label: "Anti-Cheat" },
  { id: "virtual-desktop", label: "Desktop & DPI" },
  { id: "audio", label: "Audio" },
  { id: "advanced", label: "Advanced" },
];

export interface SectionProps {
  formData: Partial<GameConfig>;
  handleChange: (field: keyof GameConfig, value: unknown) => void;
}

export function GameConfigModal({
  game,
  isOpen,
  onClose,
  onSave,
}: GameConfigModalProps) {
  const [formData, setFormData] = useState<Partial<GameConfig>>({});
  const [protonVersions, setProtonVersions] = useState<ProtonVersion[]>([]);
  const [currentSteamProton, setCurrentSteamProton] = useState<string>("");
  const [clearPrefix, setClearPrefix] = useState(false);
  const [dllCheckLoading, setDllCheckLoading] = useState(false);
  const [dllCheckResult, setDllCheckResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("game");
  const tabListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (game) {
      setFormData({
        title: game.title,
        executablePath: game.executablePath,
        prefix: game.winePrefixPath || game.prefix || "",
        protonVersion: game.protonVersion || "",
        gameArgs: game.launchOptions || game.gameArgs || "",
        prelaunchCommand: game.prelaunchCommand,
        postexitCommand: game.postexitCommand,
        env: game.env || {},
        mangoHud: game.autoRunMangohud ?? game.mangoHud ?? false,
        gameMode: game.autoRunGamemode ?? game.gameMode ?? false,
        dxvk: game.dxvk,
        esync: game.esync,
        fsync: game.fsync,
        resolution: game.resolution,
        fpsLimit: game.fpsLimit,
        vsync: game.vsync || "1",
        renderingMode: game.renderingMode || "",
        videoDriver: game.videoDriver || "",
        dxvkVersion: game.dxvkVersion || "",
        vulkan: game.vulkan || false,
        frameThrottle: game.frameThrottle || "",
        audioDriver: game.audioDriver || "",
        audioChannels: game.audioChannels || "",
        audioSampleRate: game.audioSampleRate || "",
        audioInBackground: game.audioInBackground || false,
        threadedD3D: game.threadedD3D || false,
        preferSystemLibs: game.preferSystemLibs || false,
        dllOverrides: game.dllOverrides || "",
        dlls: game.dlls || [],
        winetricks: game.winetricks || "",
        language: game.language || "",
        locale: game.locale || "",
        vkd3d: game.vkd3d || false,
        textures: game.textures || false,
        dxvkAsync: game.dxvkAsync || false,
        amdFsr: game.amdFsr || false,
        amdFsrSharpness: game.amdFsrSharpness || "",
        fluidResolution: game.fluidResolution || false,
        superResolution: game.superResolution || false,
        esyncManual: game.esyncManual || false,
        fsyncManual: game.fsyncManual || false,
        enableEac: game.enableEac || false,
        enableBattlEye: game.enableBattlEye || false,
      });
      setClearPrefix(false);
      setCurrentSteamProton("");
    }
  }, [game]);

  useEffect(() => {
    if (!isOpen || !game) return;

    const load = async () => {
      if (window.electron.platform === "linux") {
        const versions = await window.electron
          .getInstalledProtonVersions()
          .catch(() => []);
        setProtonVersions(versions);
      }

      if (game.runner === "steam" || game.shop === "steam") {
        const appId = game.objectId.replace("steam_", "");
        const current = await window.electron
          .getSteamGameProton(appId)
          .catch(() => null);
        if (current) {
          setCurrentSteamProton(current.name);
          setFormData((prev) => ({ ...prev, protonVersion: current.name }));
        }
      }
    };
    load();
  }, [isOpen, game]);

  if (!isOpen || !game) return null;

  const handleChange = (field: keyof GameConfig, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleEnvChange = (key: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      env: { ...prev.env, [key]: value },
    }));
  };

  const handleSelectExecutable = async () => {
    try {
      const result = await window.electron.showOpenDialog({
        title: "Select Game Executable",
        filters: [
          { name: "Executables", extensions: ["exe", "sh", "bin"] },
          { name: "All Files", extensions: ["*"] },
        ],
        properties: ["openFile"],
      });
      if (!result.canceled && result.filePaths.length > 0) {
        handleChange("executablePath", result.filePaths[0]);
      }
    } catch (error) {
      console.error("Failed to select executable:", error);
    }
  };

  const handleCheckDlls = async () => {
    if (!game || dllCheckLoading) return;
    setDllCheckLoading(true);
    setDllCheckResult(null);
    try {
      window.dispatchEvent(
        new CustomEvent("protonforge:dll-check-start", {
          detail: { shop: game.shop, objectId: game.objectId },
        })
      );
      const result = await window.electron.checkGameDlls(
        game.shop as any,
        game.objectId
      );
      window.dispatchEvent(
        new CustomEvent("protonforge:dll-check-done", {
          detail: { result },
        })
      );
      const parts: string[] = [];
      if (result.installed?.length > 0) {
        parts.push(`Instaladas: ${result.installed.join(", ")}`);
      }
      if (result.errors?.length > 0) {
        parts.push(`Falhas: ${result.errors.join("; ")}`);
      }
      setDllCheckResult(
        parts.length > 0
          ? parts.join(" | ")
          : "Nenhuma DLL necessária"
      );
    } catch (err) {
      setDllCheckResult(`Erro: ${String(err)}`);
      window.dispatchEvent(
        new CustomEvent("protonforge:dll-check-error", {
          detail: { error: String(err) },
        })
      );
    } finally {
      setDllCheckLoading(false);
    }
  };

  const handleSelectPrefix = async () => {
    try {
      const result = await window.electron.showOpenDialog({
        title: "Select Wine Prefix Directory",
        properties: ["openDirectory", "createDirectory"],
      });
      if (!result.canceled && result.filePaths.length > 0) {
        handleChange("prefix", result.filePaths[0]);
      }
    } catch (error) {
      console.error("Failed to select prefix:", error);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedProton = protonVersions.find(
      (p) => (p.path.split("/").pop() || p.name) === formData.protonVersion
    );
    const gameData = {
      ...game,
      ...formData,
      winePrefixPath: formData.prefix,
      protonPath: selectedProton?.path || formData.protonVersion || "",
      launchOptions: formData.gameArgs,
      autoRunMangohud: formData.mangoHud,
      autoRunGamemode: formData.gameMode,
      eac: formData.enableEac,
      battleye: formData.enableBattlEye,
      vkd3d_version: formData.vkd3dVersion,
      d3d_extras: formData.d3dExtras,
      d3d_extras_version: formData.d3dExtrasVersion,
      Desktop: formData.virtualDesktop,
      WineDesktop: formData.wineDesktop,
      Dpi: formData.dpiScaling,
      ExplicitDpi: formData.explicitDpi,
      MouseWarpOverride: formData.mouseWarpOverride,
      Graphics: formData.graphicsBackend,
    } as GameConfig;
    onSave(gameData, clearPrefix);
    onClose();
  };

  const isSteamGame = game.runner === "steam" || game.shop === "steam";

  const scrollTabs = (direction: "left" | "right") => {
    if (!tabListRef.current) return;
    const amount = 200;
    tabListRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  const sectionProps: SectionProps = { formData, handleChange };

  return (
    <div className="game-config-modal-overlay" onClick={onClose}>
      <div className="game-config-modal" onClick={(e) => e.stopPropagation()}>
        <div className="game-config-modal__header">
          <h2>Configure: {game.title}</h2>
          <Button onClick={onClose}>✕</Button>
        </div>

        <div className="game-config-modal__tab-bar">
          <button
            type="button"
            className="game-config-modal__tab-arrow"
            onClick={() => scrollTabs("left")}
            aria-label="Scroll tabs left"
          >
            ‹
          </button>
          <div className="game-config-modal__tab-list" ref={tabListRef}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`game-config-modal__tab ${
                  activeTab === tab.id
                    ? "game-config-modal__tab--active"
                    : ""
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="game-config-modal__tab-arrow"
            onClick={() => scrollTabs("right")}
            aria-label="Scroll tabs right"
          >
            ›
          </button>
        </div>

        <form onSubmit={handleSubmit} className="game-config-modal__form">
          {activeTab === "game" && (
            <GameSection
              {...sectionProps}
              onSelectExecutable={handleSelectExecutable}
            />
          )}
          {activeTab === "prefix" && (
            <PrefixSection
              {...sectionProps}
              protonVersions={protonVersions}
              currentSteamProton={currentSteamProton}
              isSteamGame={isSteamGame}
              clearPrefix={clearPrefix}
              onClearPrefixChange={setClearPrefix}
              onSelectPrefix={handleSelectPrefix}
            />
          )}
          {activeTab === "arguments" && <ArgumentsSection {...sectionProps} />}
          {activeTab === "graphics" && <GraphicsSection {...sectionProps} />}
          {activeTab === "performance" && (
            <PerformanceSection {...sectionProps} />
          )}
          {activeTab === "video" && <VideoSection {...sectionProps} />}
          {activeTab === "anti-cheat" && (
            <AntiCheatSection {...sectionProps} />
          )}
          {activeTab === "virtual-desktop" && (
            <VirtualDesktopSection {...sectionProps} />
          )}
          {activeTab === "audio" && <AudioSection {...sectionProps} />}
          {activeTab === "advanced" && (
            <AdvancedSection
              {...sectionProps}
              dllCheckLoading={dllCheckLoading}
              dllCheckResult={dllCheckResult}
              hasProton={!!game?.protonPath}
              onCheckDlls={handleCheckDlls}
              onEnvChange={handleEnvChange}
              shop={game.shop}
              objectId={game.objectId}
            />
          )}

          <div className="game-config-modal__actions">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

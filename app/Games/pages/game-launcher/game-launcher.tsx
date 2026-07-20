import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClockIcon, ToolsIcon, FileDirectoryIcon } from "@primer/octicons-react";
import { MAX_MINUTES_TO_SHOW_IN_PLAYTIME } from "@shared-constants";
import { darkenColor } from "@shared-helpers";
import { logger } from "@shared-logger";
import { average } from "color.js";
import type { Game, GameShop, ShopAssets } from "@types";
import "./game-launcher.scss";

type PreflightStatus =
  | "idle"
  | "checking"
  | "downloading"
  | "installing"
  | "analyzing"
  | "copying"
  | "scanning"
  | "preparing"
  | "snapshot"
  | "selecting"
  | "complete"
  | "error";

interface ExeCandidate {
  path: string;
  name: string;
  size: number;
}

export default function GameLauncher() {
  const { t } = useTranslation("game_launcher");
  const [searchParams] = useSearchParams();

  const shop = searchParams.get("shop") as GameShop;
  const objectId = searchParams.get("objectId");
  const bgPath = searchParams.get("bg") || "";

  const [game, setGame] = useState<Game | null>(null);
  const [gameAssets, setGameAssets] = useState<ShopAssets | null>(null);
  const [coverImage, setCoverImage] = useState("");
  const [imageResolved, setImageResolved] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [accentColor, setAccentColor] = useState<string | null>(null);
  const [colorExtracted, setColorExtracted] = useState(false);
  const [windowShown, setWindowShown] = useState(false);
  const [isMainWindowOpen, setIsMainWindowOpen] = useState(false);
  const [preflightStatus, setPreflightStatus] =
    useState<PreflightStatus>("idle");
  const [preflightDetail, setPreflightDetail] = useState<string | null>(null);
  const [preflightPercent, setPreflightPercent] = useState<number | null>(null);
  const [preflightStarted, setPreflightStarted] = useState(false);
  const [protonVersion, setProtonVersion] = useState<string | null>(null);

  const [exeCandidates, setExeCandidates] = useState<ExeCandidate[]>([]);
  const [prefixDriveCPath, setPrefixDriveCPath] = useState("");
  const [selectedExeIndex, setSelectedExeIndex] = useState<number | null>(null);
  const [selectingExecutable, setSelectingExecutable] = useState(false);
  const selectHandledRef = useRef(false);

  const formatPlayTime = useCallback(
    (playTimeInMilliseconds = 0) => {
      const minutes = playTimeInMilliseconds / 60000;

      if (minutes < MAX_MINUTES_TO_SHOW_IN_PLAYTIME) {
        return t("amount_minutes_short", { amount: minutes.toFixed(0) });
      }

      const hours = minutes / 60;
      return t("amount_hours_short", { amount: hours.toFixed(1) });
    },
    [t]
  );

  useEffect(() => {
    if (shop && objectId) {
      window.electron.getGameByObjectId(shop, objectId).then((gameData) => {
        setGame(gameData);
      });

      window.electron.getGameAssets(objectId, shop).then((assets) => {
        setGameAssets(assets);
      });
    }

    window.electron.isMainWindowOpen().then((isOpen) => {
      setIsMainWindowOpen(isOpen);
    });
  }, [shop, objectId]);

  useEffect(() => {
    if (!window.electron.onPreflightProgress) {
      return;
    }

    const unsubscribe = window.electron.onPreflightProgress(
      ({ status, detail, percent }) => {
        setPreflightStarted(true);
        setPreflightStatus(status as PreflightStatus);
        setPreflightDetail(detail);
        if (percent != null) setPreflightPercent(percent);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!window.electron.onSelectExecutable) return;

    const unsubscribe = window.electron.onSelectExecutable((value) => {
      setExeCandidates(value.candidates);
      setPrefixDriveCPath(value.prefixDriveCPath);
      setSelectedExeIndex(value.candidates.length > 0 ? 0 : null);
      setSelectingExecutable(true);
      setPreflightStatus("selecting");
      selectHandledRef.current = false;
    });

    return () => unsubscribe();
  }, []);

  const handleConfirmExe = useCallback(() => {
    if (selectedExeIndex === null || !exeCandidates[selectedExeIndex] || selectHandledRef.current) return;
    selectHandledRef.current = true;

    const chosen = exeCandidates[selectedExeIndex];
    window.electron.selectExecutable(shop!, objectId!, chosen.path);
    setSelectingExecutable(false);
    setPreflightStatus("complete");
    setPreflightDetail("Reparo concluído. Pode fechar.");
  }, [selectedExeIndex, exeCandidates, shop, objectId]);

  const handleBrowseExe = useCallback(async () => {
    const result = await window.electron.showOpenDialog({
      title: t("select_executable_title", "Select Game Executable"),
      filters: [{ name: "Executaveis", extensions: ["exe", "msi"] }],
      properties: ["openFile"],
      defaultPath: prefixDriveCPath || undefined,
    });

    if (result.canceled || !result.filePaths?.[0]) return;

    const chosenPath = result.filePaths[0];
    window.electron.selectExecutable(shop!, objectId!, chosenPath);
    setSelectingExecutable(false);
    setPreflightStatus("complete");
    setPreflightDetail("Reparo concluído. Pode fechar.");
  }, [prefixDriveCPath, shop, objectId, t]);

  // Auto-close timer
  const isPreflightDone =
    preflightStatus === "complete" || preflightStatus === "error";

  const [preflightTimeout, setPreflightTimeout] = useState(false);

  useEffect(() => {
    if (preflightStarted || preflightStatus === "selecting") return;

    const timer = setTimeout(() => {
      setPreflightTimeout(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, [preflightStarted, preflightStatus]);

  const canAutoClose =
    isPreflightDone || (!preflightStarted && preflightTimeout);

  useEffect(() => {
    if (!windowShown || !canAutoClose || selectingExecutable) return;

    const timer = setTimeout(() => {
      window.electron.closeGameLauncherWindow();
    }, 5000);

    return () => clearTimeout(timer);
  }, [windowShown, canAutoClose, selectingExecutable]);

  const handleOpenProtonForge = () => {
    window.electron.openMainWindow();
    window.electron.closeGameLauncherWindow();
  };

  const normalizedCoverImage =
    gameAssets?.coverImageUrl?.replaceAll("\\", "/").trim() || "";
  const fallbackSteamCoverImage =
    !normalizedCoverImage && shop === "steam" && objectId
      ? `https://shared.steamstatic.com/store_item_assets/steam/apps/${objectId}/library_600x900_2x.jpg`
      : "";
  const gameIconUrl = game?.iconUrl?.replaceAll("\\", "/").trim() || "";
  const coverImageSource = normalizedCoverImage || gameIconUrl || fallbackSteamCoverImage;
  const gameTitle = game?.title ?? gameAssets?.title ?? "";
  const initials = gameTitle
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";
  const playTime = game?.playTimeInMilliseconds ?? 0;
  const isWindowsExecutable =
    game?.executablePath?.toLowerCase().endsWith(".exe") ?? false;

  const extractAccentColor = useCallback(async (imageUrl: string) => {
    try {
      const color = await average(imageUrl, { amount: 1, format: "hex" });
      const colorString = typeof color === "string" ? color : color.toString();
      setAccentColor(colorString);
    } catch (error) {
      logger.error("Failed to extract accent color:", error);
    } finally {
      setColorExtracted(true);
    }
  }, []);

  const formatFileSize = useCallback((bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, []);

  const getRelativeExePath = useCallback((fullPath: string) => {
    if (!prefixDriveCPath) return fullPath;
    const rel = fullPath.replace(prefixDriveCPath, "");
    return rel.startsWith("/") || rel.startsWith("\\") ? rel.slice(1) : rel;
  }, [prefixDriveCPath]);

  const getStatusMessage = useCallback(() => {
    switch (preflightStatus) {
      case "checking":
        return t("preflight_checking");
      case "downloading":
        return t("preflight_downloading");
      case "installing":
      case "analyzing":
      case "copying":
      case "scanning":
      case "preparing":
      case "snapshot":
        return preflightDetail
          ? t("preflight_installing_detail", { detail: preflightDetail })
          : t("preflight_installing");
      case "selecting":
        return t("preflight_selecting", "Selecione o executável do jogo:");
      case "complete":
      case "error":
      case "idle":
      default:
        return t("launching_base");
    }
  }, [preflightStatus, preflightDetail, t]);

  const isPreflightRunning =
    preflightStatus === "checking" ||
    preflightStatus === "downloading" ||
    preflightStatus === "installing" ||
    preflightStatus === "analyzing" ||
    preflightStatus === "copying" ||
    preflightStatus === "scanning" ||
    preflightStatus === "preparing" ||
    preflightStatus === "snapshot";

  const hasPercent = preflightPercent != null && preflightPercent > 0;

  useEffect(() => {
    let cancelled = false;

    setImageError(false);
    setImageLoaded(false);
    setColorExtracted(false);
    setAccentColor(null);
    setImageResolved(false);

    if (!coverImageSource) {
      setCoverImage("");
      setColorExtracted(true);
      setImageResolved(true);
      return;
    }

    if (
      !coverImageSource.startsWith("http://") &&
      !coverImageSource.startsWith("https://")
    ) {
      setCoverImage(coverImageSource);
      setImageResolved(true);
      return;
    }

    window.electron.getImageDataUrl(coverImageSource).then((proxiedImage) => {
      if (cancelled) return;

      if (!proxiedImage) {
        setImageError(true);
        setCoverImage("");
        setColorExtracted(true);
      } else {
        setCoverImage(proxiedImage);
      }

      setImageResolved(true);
    });

    return () => {
      cancelled = true;
    };
  }, [coverImageSource]);

  useEffect(() => {
    if (coverImage && !colorExtracted) {
      extractAccentColor(coverImage);
    }
  }, [coverImage, colorExtracted, extractAccentColor]);

  useEffect(() => {
    let cancelled = false;

    if (
      window.electron.platform !== "linux" ||
      !shop ||
      !objectId ||
      !isWindowsExecutable
    ) {
      setProtonVersion(null);
      return;
    }

    window.electron
      .getGameLaunchProtonVersion(shop, objectId)
      .then((version) => {
        if (cancelled) return;

        setProtonVersion(version);
      });

    return () => {
      cancelled = true;
    };
  }, [isWindowsExecutable, objectId, shop]);

  const isReady =
    imageResolved && (coverImage ? imageLoaded : true) && colorExtracted;

  useEffect(() => {
    if (windowShown) return;

    if (isReady) {
      window.electron.showGameLauncherWindow();
      setWindowShown(true);
    }
  }, [isReady, windowShown]);

  const backgroundStyle = accentColor
    ? {
        background: `linear-gradient(135deg, ${darkenColor(accentColor, 0.7)} 0%, ${darkenColor(accentColor, 0.8, 0.9)} 50%, ${darkenColor(accentColor, 0.85, 0.8)} 100%)`,
      }
    : undefined;

  const glowStyle = accentColor
    ? {
        background: `radial-gradient(ellipse at top right, ${darkenColor(accentColor, 0.3, 0.15)} 0%, transparent 50%)`,
      }
    : undefined;

  const isHeartbeating = preflightStarted && isPreflightRunning;

  const statusMsg = getStatusMessage();
  const suffix = hasPercent ? ` ${preflightPercent}%` : "";

  return (
    <div
      className={`game-launcher ${isHeartbeating ? "game-launcher--heartbeat" : ""}`}
      style={backgroundStyle}
    >
      {bgPath && !coverImage && (
        <div className="game-launcher__bg" style={{ backgroundImage: `url("file://${bgPath}")` }} />
      )}
      {coverImage && (
        <div
          className="game-launcher__background"
          style={{ backgroundImage: `url(${coverImage})` }}
        />
      )}
      <div className="game-launcher__overlay" />
      <div className="game-launcher__glow" style={glowStyle} />

      {/* ── Seleção de executável: modal overlay ── */}
      {selectingExecutable ? (
        <div className="game-launcher__modal-overlay">
          <div className="game-launcher__modal-card">
            <h2 className="game-launcher__modal-title">
              {t("select_executable_title", "Selecione o executável do jogo")}
            </h2>
            <p className="game-launcher__modal-desc">
              {exeCandidates.length > 0
                ? t("select_executable_suggestions", "Encontramos estes executáveis no Wine prefix. Selecione o principal:")
                : t("select_executable_no_suggestions", "Nenhum executável encontrado. Use o botão abaixo para localizar manualmente.")}
            </p>

            {exeCandidates.length > 0 && (
              <div className="game-launcher__exe-list">
                {exeCandidates.map((exe, idx) => (
                  <button
                    key={exe.path}
                    type="button"
                    className={`game-launcher__exe-option ${
                      selectedExeIndex === idx
                        ? "game-launcher__exe-option--selected"
                        : ""
                    }`}
                    onClick={() => setSelectedExeIndex(idx)}
                  >
                    <FileDirectoryIcon size={16} />
                    <div className="game-launcher__exe-option-info">
                      <span className="game-launcher__exe-option-name">
                        {exe.name}
                      </span>
                      <span className="game-launcher__exe-option-path">
                        {getRelativeExePath(exe.path)}
                      </span>
                    </div>
                    <span className="game-launcher__exe-option-size">
                      {formatFileSize(exe.size)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="game-launcher__exe-actions">
              <button
                type="button"
                className="game-launcher__button game-launcher__button--secondary"
                onClick={handleBrowseExe}
              >
                {t("browse_manually", "Procurar")}
              </button>
              <button
                type="button"
                className="game-launcher__button"
                onClick={handleConfirmExe}
                disabled={exeCandidates.length === 0 || selectedExeIndex === null}
              >
                {t("confirm_executable", "Confirmar")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ── Tela normal de inicialização ── */
        <div className="game-launcher__content">
          {imageError || !coverImage ? (
            <div className="game-launcher__cover-placeholder">
              <span className="game-launcher__cover-initials">{initials}</span>
            </div>
          ) : (
            <>
              {!isReady && (
                <div className="game-launcher__cover-placeholder">
                  <span className="game-launcher__cover-initials">{initials}</span>
                </div>
              )}
              <img
                src={coverImage}
                alt={gameTitle}
                className="game-launcher__cover"
                style={{ display: isReady ? "block" : "none" }}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
            </>
          )}

          <div className="game-launcher__info">
            <div className="game-launcher__center">
              <h1 className="game-launcher__title">{gameTitle}</h1>

              <p className="game-launcher__status">
                {isPreflightRunning && (
                  <span className="game-launcher__spinner" />
                )}
                {statusMsg}{suffix}
                {!hasPercent && <span className="game-launcher__dots" />}
              </p>

              {hasPercent && (
                <div className="game-launcher__bar-track">
                  <div
                    className={`game-launcher__bar-fill ${isPreflightRunning && !hasPercent ? "game-launcher__bar-fill--indeterminate" : ""}`}
                    style={hasPercent || preflightStatus === "complete" ? { width: `${Math.max(2, preflightPercent ?? 100)}%` } : undefined}
                  />
                </div>
              )}

              {!isMainWindowOpen && (
                <button
                  type="button"
                  className="game-launcher__button"
                  onClick={handleOpenProtonForge}
                >
                  {t("open_protonforge")}
                </button>
              )}
            </div>

            {(playTime > 0 || protonVersion) && (
              <div className="game-launcher__stats">
                {playTime > 0 && (
                  <span className="game-launcher__stat">
                    <ClockIcon size={14} />
                    {formatPlayTime(playTime)}
                  </span>
                )}

                {protonVersion && (
                  <span className="game-launcher__stat">
                    <ToolsIcon size={14} />
                    {protonVersion}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

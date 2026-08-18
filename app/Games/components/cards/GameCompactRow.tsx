import { useEffect, useState } from "react";
import { DatabaseIcon, FileZipIcon } from "@primer/octicons-react";
import { formatBytes } from "@shared";
import { CompatibilityBadge } from "@games-ui/components/compatibility-badge/compatibility-badge";

interface CompactRowProps {
  thumbnail: string | null;
  title: string;
  runner: string;
  playTimeMs?: number;
  installerSize?: number | null;
  installedSize?: number | null;
  onPlay: () => void;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isSelected: boolean;
  /** Jogo Steam — busca os requisitos do catálogo pelo appId (como o GameLargeCard) */
  isSteam?: boolean;
  appId?: string;
  /** Requisitos já disponíveis (ex.: resultados do catálogo) — evita nova consulta */
  pcRequirements?: { minimum?: string | null; recommended?: string | null } | null;
}

/** Cache de detalhes por appId — evita reconsultar ao alternar entre visualizações */
const MAX_CACHE_SIZE = 100;
const steamDetailsCache = new Map<string, any>();

function cacheGet(key: string): any | undefined {
  const val = steamDetailsCache.get(key);
  if (val !== undefined) {
    // Move para o final (mais recente) para LRU
    steamDetailsCache.delete(key);
    steamDetailsCache.set(key, val);
  }
  return val;
}

function cacheSet(key: string, val: any): void {
  if (steamDetailsCache.has(key)) steamDetailsCache.delete(key);
  else if (steamDetailsCache.size >= MAX_CACHE_SIZE) {
    // Remove a entrada mais antiga (primeira do Map)
    const oldest = steamDetailsCache.keys().next().value;
    if (oldest !== undefined) steamDetailsCache.delete(oldest);
  }
  steamDetailsCache.set(key, val);
}

export { cacheGet as getSteamDetailsCache, cacheSet as setSteamDetailsCache };

export function GameCompactRow({
  thumbnail, title, runner, playTimeMs, installerSize, installedSize,
  onPlay, onClick, onContextMenu, isSelected,
  isSteam, appId, pcRequirements,
}: CompactRowProps) {
  const [details, setDetails] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    if (!isSteam || !appId || pcRequirements) return;
    const cached = cacheGet(appId);
    if (cached) {
      setDetails(cached);
      return;
    }
    let cancelled = false;
    window.electron.getGameShopDetails(appId, "steam", "en")
      .then((data: any) => {
        if (!cancelled && data) {
          cacheSet(appId, data);
          setDetails(data);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isSteam, appId, pcRequirements]);

  const hours = playTimeMs ? (playTimeMs / 3600000).toFixed(1) : null;
  const effReq =
    pcRequirements ??
    (isSteam ? details?.pc_requirements : null) ??
    null;

  return (
    <div
      className={`game-compact-row ${isSelected ? "game-compact-row--selected" : ""}`}
      onClick={onClick}
      onDoubleClick={onPlay}
      onContextMenu={onContextMenu}
    >
      <div className="game-compact-row__thumb">
        {thumbnail ? (
          <img src={thumbnail} alt={title} loading="lazy" />
        ) : (
          <div className="game-compact-row__thumb-placeholder">
            {title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="game-compact-row__name">{title}</div>
      <span className="game-compact-row__badge">{runner === "steam" ? "Steam" : "Local"}</span>
      {installerSize != null && installerSize > 0 && (
        <span className="game-compact-row__size"><FileZipIcon size={12} />{formatBytes(installerSize)}</span>
      )}
      {installedSize != null && installedSize > 0 && (
        <span className="game-compact-row__size"><DatabaseIcon size={12} />{formatBytes(installedSize)}</span>
      )}
      {hours && <span className="game-compact-row__hours">{hours}h</span>}
      {effReq?.minimum && (
        <CompatibilityBadge
          minimum={effReq.minimum}
          recommended={effReq.recommended}
          compact
        />
      )}
      <button
        className="game-compact-row__play"
        onClick={(e) => { e.stopPropagation(); onPlay(); }}
        title="Aba Games: inicializa apenas o jogo (SEM mods). Para jogar com mods habilitados, use o Mod Manager (▶ Iniciar Jogo)."
      >▶</button>
    </div>
  );
}

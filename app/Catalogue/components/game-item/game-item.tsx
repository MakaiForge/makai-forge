import { Badge } from "@renderer/components/badge/badge";
import { buildGameDetailsPath } from "@renderer/helpers";
import { useAppSelector, useLibrary, useModCompatibleGames } from "@renderer/hooks";
import { lazy, Suspense, useMemo, useState, useEffect, useCallback } from "react";
import { Link } from "@renderer/components/link/link";

import "./game-item.scss";
import { useTranslation } from "react-i18next";
import { CatalogueSearchResult } from "@types";
import { QuestionIcon, PlusIcon, CheckIcon } from "@primer/octicons-react";
import cn from "classnames";

const ProtonDBBadge = lazy(async () => {
  const mod = await import("@proton/renderer/components/protondb-badge/protondb-badge");
  return { default: mod.ProtonDBBadge };
});

export interface GameItemProps {
  game: CatalogueSearchResult;
}

export function GameItem({ game }: GameItemProps) {
  const { i18n, t } = useTranslation("game_details");

  const language = i18n.language.split("-")[0];

  const { steamGenres } = useAppSelector((state) => state.catalogueSearch);

  const [isAddingToLibrary, setIsAddingToLibrary] = useState(false);

  const [added, setAdded] = useState(false);

  const [fallbackIndex, setFallbackIndex] = useState(0);
  const [imageError, setImageError] = useState(false);

  const imageSources = [
    game.libraryImageUrl,
    game.objectId
      ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.objectId}/library_600x900_2x.jpg`
      : null,
    game.objectId
      ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.objectId}/header.jpg`
      : null,
  ].filter((url): url is string => !!url);

  const { library, updateLibrary } = useLibrary();
  const shouldShowProtonFeatures = window.electron.platform === "linux";
  const { isCompatible } = useModCompatibleGames();
  const compatible = isCompatible(game.shop, game.objectId, game.title);

  useEffect(() => {
    const exists = library.some(
      (libItem) =>
        libItem.shop === game.shop && libItem.objectId === game.objectId
    );
    setAdded(exists);
  }, [library, game.shop, game.objectId]);

  const addGameToLibrary = async () => {
    if (added || isAddingToLibrary) return;

    setIsAddingToLibrary(true);

    try {
      await window.electron.addGameToLibrary(
        game.shop,
        game.objectId,
        game.title
      );
      updateLibrary();
    } catch (error) {
      console.error(error);
    } finally {
      setIsAddingToLibrary(false);
    }
  };

  const genres = useMemo(() => {
    return game.genres?.map((genre) => {
      const index = steamGenres["en"]?.findIndex(
        (steamGenre) => steamGenre === genre
      );

      if (
        index !== undefined &&
        steamGenres[language] &&
        steamGenres[language][index]
      ) {
        return steamGenres[language][index];
      }

      return genre;
    });
  }, [game.genres, language, steamGenres]);

  const handleImageError = useCallback(() => {
    if (fallbackIndex < imageSources.length - 1) {
      setFallbackIndex((prev) => prev + 1);
    } else {
      setImageError(true);
    }
  }, [fallbackIndex, imageSources.length]);

  const libraryImage = useMemo(() => {
    if (imageError || !imageSources.length) {
      return (
        <div className="game-item__cover-placeholder">
          <QuestionIcon size={28} />
        </div>
      );
    }

    const src = imageSources[fallbackIndex] || imageSources[0];

    return (
      <img
        className="game-item__cover"
        src={src}
        alt={game.title}
        width={200}
        height={103}
        loading="lazy"
        onError={handleImageError}
      />
    );
  }, [game.title, imageError, imageSources, fallbackIndex, handleImageError]);

  const rawProtonValue =
    game.tier ??
    game.bestReportedTier ??
    game.protondbSupportBadge ??
    game.protondbSupportBadges?.[0] ??
    null;
  const protonBadgeValue = rawProtonValue?.toLowerCase().trim() ?? null;
  const protonBadge =
    protonBadgeValue &&
    ["borked", "bronze", "silver", "gold", "platinum"].includes(
      protonBadgeValue
    )
      ? protonBadgeValue
      : null;

  return (
    <article className="game-item">
      <Link to={buildGameDetailsPath(game)} className="game-item__content-link">
        <div className="game-item__cover-wrapper">
          {libraryImage}

          {shouldShowProtonFeatures && protonBadge && (
            <Suspense fallback={null}>
              <ProtonDBBadge badge={protonBadge} />
            </Suspense>
          )}
        </div>

        <div className="game-item__details">
          <span>{game.title}</span>
          <span className="game-item__genres">{genres.join(", ")}</span>

          {game.recommendedProton && (
            <span className={`game-item__proton-badge game-item__proton-badge--${game.protonConfidence || "low"}`}>
              {game.protonSource === "GE-Proton" ? "GE" : "Valve"} Proton{game.protonConfidence !== "low" ? `: ${game.recommendedProton}` : ""}
            </span>
          )}

          {compatible && (
            <span className="game-item__compatible-badge">Mod Manager</span>
          )}

          {game.downloadSources?.length ? (
            <div className="game-item__repackers">
              {game.downloadSources.map((sourceName) => (
                <Badge key={sourceName}>{sourceName}</Badge>
              ))}
            </div>
          ) : null}
        </div>
      </Link>
      <button
        type="button"
        className={cn("game-item__plus-wrapper", {
          "game-item__plus-wrapper--added": added,
        })}
        onClick={addGameToLibrary}
        title={added ? t("already_in_library") : t("add_to_library")}
        aria-label={added ? t("already_in_library") : t("add_to_library")}
        disabled={added || isAddingToLibrary}
      >
        {added ? <CheckIcon size={16} fill="#5865f2" /> : <PlusIcon size={16} fill="#5865f2" />}
      </button>
    </article>
  );
}

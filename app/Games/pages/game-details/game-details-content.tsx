import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftIcon, PencilIcon } from "@primer/octicons-react";
import { useTranslation } from "react-i18next";

import { HeroPanel } from "./hero";
import { DescriptionHeader } from "./description-header/description-header";
import { GallerySlider } from "./gallery-slider/gallery-slider";
import { Sidebar } from "./sidebar/sidebar";
import { GameLogo } from "./game-logo";
import { ScriptsSection } from "./scripts-section/scripts-section";

import { cloudSyncContext, gameDetailsContext } from "@renderer/context";

import "./game-details.scss";
import "./hero.scss";

export function GameDetailsContent() {
  const navigate = useNavigate();
  const { t } = useTranslation("game_details");

  const {
    objectId,
    shopDetails,
    game,
    hasNSFWContentBlocked,
    shop,
    setShowGameOptionsModal,
    setGameOptionsInitialCategory,
  } = useContext(gameDetailsContext);

  const { getGameArtifacts } = useContext(cloudSyncContext);

  const [backdropOpacity, setBackdropOpacity] = useState(1);
  const [heroImageError, setHeroImageError] = useState(false);

  useEffect(() => {
    setBackdropOpacity(1);
    setHeroImageError(false);
  }, [objectId]);

  const handleEditGameClick = () => {
    setGameOptionsInitialCategory("assets");
    setShowGameOptionsModal(true);
  };

  useEffect(() => {
    getGameArtifacts();
  }, [getGameArtifacts]);

  const isCustomGame = shop === "custom";

  const heroImage = isCustomGame
    ? game?.libraryHeroImageUrl || game?.iconUrl || shopDetails?.assets?.libraryHeroImageUrl || shopDetails?.background || shopDetails?.headerImage || ""
    : game?.customHeroImageUrl || shopDetails?.assets?.libraryHeroImageUrl || shopDetails?.background || shopDetails?.headerImage || "";

  return (
    <div
      className={`game-details__wrapper ${hasNSFWContentBlocked ? "game-details__wrapper--blurred" : ""}`}
    >
      <section className="game-details__container">
        <div className="game-details__hero">
          <img
            src={heroImageError ? shopDetails?.assets?.libraryImageUrl || shopDetails?.headerImage || "" : heroImage}
            className="game-details__hero-image"
            alt={game?.title}
            onError={() => setHeroImageError(true)}
          />

          <div
            className="game-details__hero-logo-backdrop"
            style={{ opacity: backdropOpacity }}
          >
            <div className="game-details__hero-content">
              <GameLogo game={game} shopDetails={shopDetails} />

              <button
                type="button"
                className="game-details__back-button"
                onClick={() => navigate(-1)}
                title={t("back", "Voltar")}
              >
                <ArrowLeftIcon size={18} />
              </button>

              <div className="game-details__hero-buttons">
                {game && (
                  <button
                    type="button"
                    className="game-details__edit-custom-game-button"
                    onClick={handleEditGameClick}
                    title={t("edit_game_modal_button")}
                  >
                    <PencilIcon size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="game-details__hero-panel">
              <HeroPanel />
            </div>
          </div>
        </div>

        <div className="game-details__description-container">
          <div className="game-details__description-content">
            <DescriptionHeader />
            <GallerySlider />

            <ScriptsSection shop={shop} objectId={objectId!} />
          </div>

          <Sidebar />
        </div>
      </section>
    </div>
  );
}

import { lazy, Suspense, useContext, useEffect, useState } from "react";
import type { ProtonDBData, SteamAppDetails } from "@types";
import { useTranslation } from "react-i18next";
import { Button } from "@renderer/components/button/button";

import { gameDetailsContext } from "@renderer/context";
import { SidebarSection } from "../sidebar-section/sidebar-section";
import "./sidebar.scss";
import { GameLanguageSection } from "./game-language-section";
import { useModCompatibleGames } from "@renderer/hooks";

const ProtonDBSection = lazy(async () => {
  const mod = await import("@proton/renderer/components/protondb-section/protondb-section");
  return { default: mod.ProtonDBSection };
});

const protonDBResponseCache = new Map<string, ProtonDBData | null>();
const protonDBInFlightRequests = new Map<
  string,
  Promise<ProtonDBData | null>
>();

const getProtonDBData = (shop: string, objectId: string) => {
  const cacheKey = `${shop}:${objectId}`;

  if (protonDBResponseCache.has(cacheKey)) {
    return Promise.resolve(protonDBResponseCache.get(cacheKey) ?? null);
  }

  const inFlightRequest = protonDBInFlightRequests.get(cacheKey);
  if (inFlightRequest) {
    return inFlightRequest;
  }

  const request = window.electron.forgerApi
    .get<ProtonDBData | null>(`/games/${shop}/${objectId}/protondb`, {
      needsAuth: false,
    })
    .then((protonData) => {
      protonDBResponseCache.set(cacheKey, protonData);
      return protonData;
    })
    .catch(() => null)
    .finally(() => {
      protonDBInFlightRequests.delete(cacheKey);
    });

  protonDBInFlightRequests.set(cacheKey, request);
  return request;
};

export function Sidebar() {
  const shouldShowProtonFeatures = window.electron.platform === "linux";
  const [protonDB, setProtonDB] = useState<{
    isLoading: boolean;
    data: ProtonDBData | null;
  }>({ isLoading: shouldShowProtonFeatures, data: null });

  const [activeRequirement, setActiveRequirement] =
    useState<keyof SteamAppDetails["pc_requirements"]>("minimum");

  const { gameTitle, shopDetails, objectId, shop, game } =
    useContext(gameDetailsContext);

  const { t } = useTranslation("game_details");
  const { isCompatible } = useModCompatibleGames();
  const compatible = isCompatible(shop, objectId ?? "", gameTitle);

  useEffect(() => {
    if (!shouldShowProtonFeatures || !objectId) {
      setProtonDB({ isLoading: false, data: null });
      return;
    }

    setProtonDB({ isLoading: true, data: null });

    getProtonDBData(shop, objectId)
      .then((protonData) => {
        setProtonDB({ isLoading: false, data: protonData });
      })
      .catch(() => {
        setProtonDB({ isLoading: false, data: null });
      });
  }, [shouldShowProtonFeatures, objectId, shop]);

  return (
    <aside className="content-sidebar">
      {shouldShowProtonFeatures && (
        <Suspense fallback={null}>
          <ProtonDBSection
            protonDBData={protonDB.data}
            isLoading={protonDB.isLoading}
            objectId={objectId ?? ""}
          />
        </Suspense>
      )}

      {((shopDetails as any)?.recommendedProton || (game as any)?.recommendedProton) && (
        <SidebarSection title={t("proton_recommended")}>
          <div className="proton-recommended">
            <span className={`proton-recommended__badge proton-recommended__badge--${(shopDetails as any)?.protonConfidence || (game as any)?.protonConfidence || "low"}`}>
              {(shopDetails as any)?.protonSource === "GE-Proton" ? "GE" : "Valve"} Proton: {(shopDetails as any)?.recommendedProton || (game as any)?.recommendedProton}
            </span>
            {((shopDetails as any)?.protonConfidence || (game as any)?.protonConfidence) && (
              <span className="proton-recommended__confidence">
                {t(`proton_confidence_${(shopDetails as any)?.protonConfidence || (game as any)?.protonConfidence}`)}
              </span>
            )}

            {((shopDetails as any)?.protonAlternatives || (game as any)?.protonAlternatives) && (
              <div className="proton-recommended__alternatives">
                <span className="proton-recommended__alt-title">{t("also_compatible")}</span>
                {((shopDetails as any)?.protonAlternatives || (game as any)?.protonAlternatives || []).map((alt: any, i: number) => (
                  <div key={i} className="proton-recommended__alt-item">
                    <span className="proton-recommended__alt-fork">{alt.fork}</span>
                    <span className="proton-recommended__alt-version">{alt.version}</span>
                    {alt.notes && <span className="proton-recommended__alt-notes">{alt.notes}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </SidebarSection>
      )}

      <SidebarSection title={t("requirements")}>
        <div className="requirement__button-container">
          <Button
            className="requirement__button"
            onClick={() => setActiveRequirement("minimum")}
            theme={activeRequirement === "minimum" ? "primary" : "outline"}
          >
            {t("minimum")}
          </Button>

          <Button
            className="requirement__button"
            onClick={() => setActiveRequirement("recommended")}
            theme={activeRequirement === "recommended" ? "primary" : "outline"}
          >
            {t("recommended")}
          </Button>
        </div>

        <div
          className="requirement__details"
          dangerouslySetInnerHTML={{
            __html:
              shopDetails?.pc_requirements?.[activeRequirement] ??
              t(`no_${activeRequirement}_requirements`, {
                gameTitle,
              }),
          }}
        />
      </SidebarSection>

      {compatible && (
        <SidebarSection title="Mod Manager">
          <div className="compatible-mod-badge">
            Compatível com o Gerenciador de Mods
          </div>
        </SidebarSection>
      )}

      <GameLanguageSection />
    </aside>
  );
}

import { useTranslation } from "react-i18next";
import { BrowserView, BrowserViewEmpty } from "@renderer/components/browser-view";

import { useHomeData } from "./hooks/useHomeData";
import { NewsCarousel } from "./components/news-carousel/news-carousel";
import { FeaturedDeals } from "./components/featured-deals/featured-deals";
import { FreeGames } from "./components/free-games/free-games";
import { makeTranslateUrl } from "./utils/formatters";
import "./home.scss";

export default function Home() {
  const { i18n } = useTranslation("home");
  const userLang = i18n.language || "pt-BR";

  const {
    deals, news, freeGames, loading,
    activeTab, setActiveTab,
    pendingArticle,
    handleSelectArticle, handleOpenUrl,
  } = useHomeData(userLang);

  const needsTranslate = (sourceLang: string): boolean => {
    if (!sourceLang) return false;
    const base = userLang.split("-")[0];
    const sourceBase = sourceLang.split("-")[0];
    return sourceBase !== base;
  };

  return (
    <div className="home__layout">
      <div className="home__tabs">
        <button
          className={`home__tab ${activeTab === "inicio" ? "home__tab--active" : ""}`}
          onClick={() => setActiveTab("inicio")}
        >
          Início
        </button>
        <button
          className={`home__tab ${activeTab === "navegador" ? "home__tab--active" : ""}`}
          onClick={() => setActiveTab("navegador")}
        >
          Navegador
        </button>
      </div>

      {activeTab === "inicio" && (
        loading ? (
          <div className="home__content">
            <div className="home__skeleton home__skeleton--carousel" />
            <div className="home__deals-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="home__skeleton home__skeleton--card" />
              ))}
            </div>
          </div>
        ) : (
          <div className="home__content">
            <NewsCarousel
              articles={news}
              onSelectArticle={handleSelectArticle}
            />

            <FeaturedDeals
              deals={deals}
              onOpenUrl={handleOpenUrl}
            />

            <FreeGames
              games={freeGames}
              onOpenUrl={handleOpenUrl}
            />
          </div>
        )
      )}

      {activeTab === "navegador" && (
        pendingArticle ? (
          <BrowserView
            url={
              needsTranslate(pendingArticle.sourceLang)
                ? makeTranslateUrl(pendingArticle.url, userLang)
                : pendingArticle.url
            }
          />
        ) : (
          <BrowserViewEmpty
            message="Navegador"
            hint="Clique em uma notícia ou promoção para abrir aqui"
          />
        )
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import type { DealData, FreeGameData, NewsArticle } from "@types";

const NEWS_REFRESH_MS = 3 * 60 * 60 * 1000;

interface PendingArticle {
  url: string;
  sourceLang: string;
}

type TabId = "inicio" | "navegador";

export function useHomeData(userLang: string) {
  const [deals, setDeals] = useState<DealData[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [freeGames, setFreeGames] = useState<FreeGameData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("inicio");
  const [pendingArticle, setPendingArticle] = useState<PendingArticle | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadCached = async () => {
      const [dealsRes, newsRes, freeRes] = await Promise.allSettled([
        window.electron.getHomeDealsCached(),
        window.electron.getLinuxNewsCached(userLang),
        window.electron.getFreeGamesCached(),
      ]);
      if (cancelled) return;
      let hasData = false;
      if (dealsRes.status === "fulfilled" && dealsRes.value) { setDeals(dealsRes.value); hasData = true; }
      if (newsRes.status === "fulfilled" && newsRes.value) { setNews(newsRes.value); hasData = true; }
      if (freeRes.status === "fulfilled" && freeRes.value) { setFreeGames(freeRes.value); hasData = true; }
      if (hasData) setLoading(false);
    };

    const loadFresh = async () => {
      try {
        const [dealsRes, newsRes, freeRes] = await Promise.allSettled([
          window.electron.getHomeDeals(),
          window.electron.getLinuxNews(userLang),
          window.electron.getFreeGames(userLang),
        ]);
        if (cancelled) return;
        if (dealsRes.status === "fulfilled" && dealsRes.value) setDeals(dealsRes.value);
        if (newsRes.status === "fulfilled" && newsRes.value) setNews(newsRes.value);
        if (freeRes.status === "fulfilled" && freeRes.value) setFreeGames(freeRes.value);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadCached();
    loadFresh();

    const interval = setInterval(loadFresh, NEWS_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userLang]);

  const handleSelectArticle = useCallback((article: NewsArticle) => {
    setPendingArticle({
      url: article.link,
      sourceLang: article.sourceLang,
    });
    setActiveTab("navegador");
  }, []);

  const handleOpenUrl = useCallback((url: string) => {
    window.electron.openExternal(url);
  }, []);

  return {
    deals, news, freeGames, loading,
    activeTab, setActiveTab,
    pendingArticle, setPendingArticle,
    handleSelectArticle, handleOpenUrl,
  };
}

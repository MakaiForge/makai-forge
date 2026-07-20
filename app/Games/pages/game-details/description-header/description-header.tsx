import { useTranslation } from "react-i18next";
import { useContext, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { gameDetailsContext } from "@renderer/context";
import type { GamePrices } from "@types";

import "./description-header.scss";

const CHEAPSHARK_ICON_BASE = "https://www.cheapshark.com/img/stores/icons";

interface FixedStore {
  name: string;
  domain: string;
  urlTemplate: (title: string) => string;
}

const FIXED_STORES: FixedStore[] = [
  { name: "G2A", domain: "g2a.com", urlTemplate: (t) => `https://www.g2a.com/search?query=${encodeURIComponent(t)}` },
  { name: "Eneba", domain: "eneba.com", urlTemplate: (t) => `https://www.eneba.com/store/games?search=${encodeURIComponent(t)}` },
  { name: "Kinguin", domain: "kinguin.net", urlTemplate: (t) => `https://www.kinguin.net/catalogsearch/result/?q=${encodeURIComponent(t)}` },
  { name: "Gamivo", domain: "gamivo.com", urlTemplate: (t) => `https://www.gamivo.com/search/${encodeURIComponent(t)}` },
  { name: "CDKeys", domain: "cdkeys.com", urlTemplate: (t) => `https://www.cdkeys.com/catalogsearch/result/?q=${encodeURIComponent(t)}` },
  { name: "Instant Gaming", domain: "instant-gaming.com", urlTemplate: (t) => `https://www.instant-gaming.com/en/search/?q=${encodeURIComponent(t)}` },
  { name: "Fanatical", domain: "fanatical.com", urlTemplate: (t) => `https://www.fanatical.com/en/search?search=${encodeURIComponent(t)}` },
  { name: "Green Man Gaming", domain: "greenmangaming.com", urlTemplate: (t) => `https://www.greenmangaming.com/search/?q=${encodeURIComponent(t)}` },
  { name: "Humble Store", domain: "humblebundle.com", urlTemplate: (t) => `https://www.humblebundle.com/store/search?search=${encodeURIComponent(t)}` },
  { name: "Amazon", domain: "amazon.com", urlTemplate: (t) => `https://www.amazon.com/s?k=${encodeURIComponent(t)}+video+game` },
];

function storeFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
}

function localeForCurrency(locale: string): string {
  const map: Record<string, string> = {
    "pt-BR": "pt-BR",
    "pt-PT": "pt-PT",
    "en-US": "en-US",
    "en-GB": "en-GB",
    ru: "ru-RU",
    es: "es-ES",
    fr: "fr-FR",
    de: "de-DE",
    it: "it-IT",
    pl: "pl-PL",
    uk: "uk-UA",
    tr: "tr-TR",
    "zh-CN": "zh-CN",
    "zh-TW": "zh-TW",
    ja: "ja-JP",
    ko: "ko-KR",
  };
  return map[locale] || map[locale?.split("-")[0]] || "en-US";
}

export function DescriptionHeader() {
  const { shopDetails, objectId, shop } = useContext(gameDetailsContext);
  const { t, i18n } = useTranslation("game_details");

  const [gamePrices, setGamePrices] = useState<GamePrices | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLocale = i18n.language;

  useEffect(() => {
    if (shop !== "steam" || !objectId) return;
    setGamePrices(null);
    setDropdownOpen(false);
    window.electron
      .getGamePrices(objectId, currentLocale)
      .then(setGamePrices)
      .catch(() => {});
  }, [objectId, shop, currentLocale]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const openDeal = useCallback((url: string) => {
    window.electron.openExternal(url);
    setDropdownOpen(false);
  }, []);

  const openSteamStore = useCallback(() => {
    window.electron.openExternal(`https://store.steampowered.com/app/${objectId}`);
  }, [objectId]);

  const gameTitle = (shopDetails as any)?.name || gamePrices?.title || "";

  const priceCurrency = gamePrices?.currency || "USD";
  const priceLocale = localeForCurrency(currentLocale);

  const formatPrice = useCallback(
    (amount: string) => {
      const num = parseFloat(amount);
      if (isNaN(num)) return amount;
      try {
        return new Intl.NumberFormat(priceLocale, {
          style: "currency",
          currency: priceCurrency,
          minimumFractionDigits: 2,
        }).format(num);
      } catch {
        return `${priceCurrency} ${num.toFixed(2)}`;
      }
    },
    [priceLocale, priceCurrency]
  );

  const cheapsharkDeals = useMemo(() => {
    return (gamePrices?.deals || []).filter((d) => d.storeId !== "1");
  }, [gamePrices]);

  const cheapsharkStoreNames = useMemo(() => {
    return new Set(cheapsharkDeals.map((d) => d.storeName));
  }, [cheapsharkDeals]);

  const fixedStoreLinks = useMemo(() => {
    if (!gameTitle) return [];
    return FIXED_STORES.filter((s) => !cheapsharkStoreNames.has(s.name));
  }, [gameTitle, cheapsharkStoreNames]);

  const hasAnySource = cheapsharkDeals.length > 0 || fixedStoreLinks.length > 0;

  if (!shopDetails) return null;

  const price = (shopDetails as any).price;
  const priceLabel =
    price != null
      ? price.final_formatted
        ? t("price", { price: price.final_formatted })
        : price.discount_percent > 0
          ? t("price", { price: formatSteamPrice(price.final, price.currency) })
          : t("free_to_play")
      : "";

  const showPrices = shop === "steam" && objectId;

  return (
    <div className="description-header">
      <section className="description-header__info">
        <p>
          {t("release_date", {
            date: shopDetails?.release_date.date,
          })}
        </p>

        {Array.isArray(shopDetails.publishers) && (
          <p>{t("publisher", { publisher: shopDetails.publishers[0] })}</p>
        )}

        {priceLabel && <p className="description-header__price">{priceLabel}</p>}
      </section>

      {showPrices && (
        <section className="description-header__actions" ref={dropdownRef}>
          <button
            className="description-header__steam-btn"
            onClick={openSteamStore}
            title="Abrir na Steam"
          >
            <SteamIcon />
            <span>{t("open_in_steam", "Abrir na Steam")}</span>
          </button>

          {hasAnySource && (
            <button
              className={`description-header__chevron ${dropdownOpen ? "description-header__chevron--open" : ""}`}
              onClick={() => setDropdownOpen((prev) => !prev)}
              title={t("view_all_prices", "Ver outros preços")}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path fillRule="evenodd" d="M12.78 5.22a.75.75 0 010 1.06l-4 4a.75.75 0 01-1.06 0l-4-4a.75.75 0 011.06-1.06L8 8.44l3.72-3.72a.75.75 0 011.06 0z"/></svg>
            </button>
          )}

          {dropdownOpen && (
            <div className="description-header__dropdown">
              {cheapsharkDeals.length > 0 && (
                <>
                  <div className="description-header__dropdown-header">
                    {t("retail_price", "Lojas oficiais")}
                  </div>
                  {cheapsharkDeals.map((deal) => (
                    <button
                      key={deal.storeId + deal.price}
                      className="description-header__deal"
                      onClick={() => openDeal(deal.dealUrl)}
                    >
                      <img
                        className="description-header__store-icon"
                        src={`${CHEAPSHARK_ICON_BASE}/${deal.storeId}.png`}
                        alt={deal.storeName}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <span className="description-header__store-name">
                        {deal.storeName}
                      </span>
                      <span className="description-header__deal-price">
                        {formatPrice(deal.price)}
                      </span>
                    </button>
                  ))}
                </>
              )}

              {fixedStoreLinks.length > 0 && (
                <>
                  <div className="description-header__dropdown-header">
                    {t("keyshop_price", "Keyshops")}
                  </div>
                  {fixedStoreLinks.map((store) => (
                    <button
                      key={store.name}
                      className="description-header__deal"
                      onClick={() => openDeal(store.urlTemplate(gameTitle))}
                    >
                      <img
                        className="description-header__store-icon"
                        src={storeFaviconUrl(store.domain)}
                        alt={store.name}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <span className="description-header__store-name">
                        {store.name}
                      </span>
                      <svg className="description-header__external-icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                        <path fillRule="evenodd" d="M10.604 1h4.146a.25.25 0 01.25.25v4.146a.25.25 0 01-.427.177L13.03 4.03 9.28 7.78a.75.75 0 01-1.06-1.06l3.75-3.75-1.543-1.543A.25.25 0 0110.604 1zM3.75 2A1.75 1.75 0 002 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 12.25v-3.5a.75.75 0 00-1.5 0v3.5a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25v-8.5a.25.25 0 01.25-.25h3.5a.75.75 0 000-1.5h-3.5z"/>
                      </svg>
                    </button>
                  ))}
                </>
              )}

              {gamePrices && (
                <a
                  className="description-header__gg-link"
                  href={`https://gg.deals/search/?q=${encodeURIComponent(gamePrices.title)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    openDeal(
                      `https://gg.deals/search/?q=${encodeURIComponent(gamePrices.title)}`
                    );
                  }}
                >
                  {t("view_all_prices", "Comparar todos os preços no gg.deals")}
                </a>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function SteamIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12c0 5.52 4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
    </svg>
  );
}

function formatSteamPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

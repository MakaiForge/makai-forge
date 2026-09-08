import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { logger } from "./logger";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const EXCHANGE_API = "https://open.er-api.com/v6/latest/USD";

interface ExchangeRates {
  [currency: string]: number;
}

interface CachedRates {
  rates: ExchangeRates;
  fetchedAt: number;
}

const LANGUAGE_TO_CURRENCY: Record<string, string> = {
  pt: "BRL",
  "pt-BR": "BRL",
  "pt-PT": "EUR",
  en: "USD",
  "en-US": "USD",
  "en-GB": "GBP",
  ru: "RUB",
  es: "EUR",
  fr: "EUR",
  de: "EUR",
  it: "EUR",
  pl: "PLN",
  uk: "UAH",
  tr: "TRY",
  "zh-CN": "CNY",
  "zh-TW": "TWD",
  ja: "JPY",
  ko: "KRW",
  sv: "SEK",
  da: "DKK",
  no: "NOK",
  fi: "EUR",
  nl: "EUR",
  cs: "CZK",
  ro: "RON",
  hu: "HUF",
  th: "THB",
  vi: "VND",
  ar: "SAR",
  id: "IDR",
  ms: "MYR",
};

function getCachePath(): string {
  const dir = app.isPackaged
    ? path.join(process.resourcesPath, "app", "_data")
    : path.join(app.getAppPath(), "app", "_data");
  return path.join(dir, "exchange-rates.json");
}

function readCachedRates(): ExchangeRates | null {
  try {
    const filePath = getCachePath();
    if (!fs.existsSync(filePath)) return null;
    const entry: CachedRates = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (Date.now() - entry.fetchedAt < CACHE_TTL_MS) return entry.rates;
    return null;
  } catch {
    return null;
  }
}

function writeRates(rates: ExchangeRates): void {
  try {
    const entry: CachedRates = { rates, fetchedAt: Date.now() };
    fs.writeFileSync(getCachePath(), JSON.stringify(entry), "utf-8");
  } catch (err) {
    logger.error("[currency] Failed to cache rates", err);
  }
}

let memoryCache: ExchangeRates | null = null;

export function getCurrencyForLanguage(language: string): string {
  return LANGUAGE_TO_CURRENCY[language] || LANGUAGE_TO_CURRENCY[language.split("-")[0]] || "USD";
}

export async function getExchangeRate(
  from: string,
  to: string
): Promise<number> {
  if (from === to) return 1;

  const cached = readCachedRates() || memoryCache;
  if (cached && cached[to] !== undefined) {
    if (!memoryCache) memoryCache = cached;
    return cached[to];
  }

  try {
    const res = await fetch(EXCHANGE_API);
    const data = (await res.json()) as { rates: Record<string, number> };

    if (data?.rates) {
      memoryCache = data.rates;
      writeRates(data.rates);

      if (data.rates[to] !== undefined) return data.rates[to];
    }
  } catch (err) {
    logger.error("[currency] Failed to fetch exchange rates", err);
  }

  return 1;
}

export function formatCurrency(
  amount: number,
  currency: string,
  locale: string
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

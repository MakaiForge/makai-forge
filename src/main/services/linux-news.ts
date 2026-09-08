import { JSDOM } from "jsdom";

interface FeedEntry {
  name: string;
  url: string;
  lang: string;
}

const FEEDS: Record<string, FeedEntry[]> = {
  pt: [
    { name: "Diolinux", url: "https://diolinux.com.br/feed", lang: "pt-BR" },
    { name: "BR-Linux", url: "https://br-linux.org/feed/", lang: "pt-BR" },
    { name: "GamingOnLinux", url: "https://www.gamingonlinux.com/article_rss.php", lang: "en" },
  ],
  es: [
    { name: "Muylinux", url: "https://www.muylinux.com/feed", lang: "es" },
    { name: "DesdeLinux", url: "https://blog.desdelinux.net/feed/", lang: "es" },
    { name: "GamingOnLinux", url: "https://www.gamingonlinux.com/article_rss.php", lang: "en" },
  ],
  fr: [
    { name: "LinuxFr.org", url: "https://linuxfr.org/news.atom", lang: "fr" },
    { name: "GamingOnLinux", url: "https://www.gamingonlinux.com/article_rss.php", lang: "en" },
  ],
  it: [
    { name: "LinuxZine.it", url: "https://www.linuxzine.it/feed/", lang: "it" },
    { name: "MammaUsaLinux", url: "https://www.miamammausalinux.org/feed/", lang: "it" },
    { name: "GamingOnLinux", url: "https://www.gamingonlinux.com/article_rss.php", lang: "en" },
  ],
  ru: [
    { name: "GamingOnLinux", url: "https://www.gamingonlinux.com/article_rss.php", lang: "en" },
    { name: "BoilingSteam", url: "https://boilingsteam.com/feed/", lang: "en" },
  ],
  default: [
    { name: "Phoronix", url: "https://www.phoronix.com/rss.php", lang: "en" },
    { name: "GamingOnLinux", url: "https://www.gamingonlinux.com/article_rss.php", lang: "en" },
    { name: "OMG! Linux", url: "https://www.omglinux.com/feed/", lang: "en" },
    { name: "BoilingSteam", url: "https://boilingsteam.com/feed/", lang: "en" },
  ],
};

export interface NewsArticle {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  sourceLang: string;
  thumbnail: string | null;
}

interface CacheEntry {
  data: NewsArticle[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 60 * 1000;

function extractThumbnail(description: string): string | null {
  const match = description.match(/<img[^>]+src="([^">]+)"/);
  return match ? match[1] : null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function parseFeed(xml: string, sourceName: string, sourceLang: string): NewsArticle[] {
  const dom = new JSDOM(xml, { contentType: "text/xml" });
  const doc = dom.window.document;
  const articles: NewsArticle[] = [];

  // RSS: <item> elements
  const items = doc.querySelectorAll("item");
  items.forEach((item) => {
    const title = item.querySelector("title")?.textContent || "";
    const link = item.querySelector("link")?.textContent || "";
    const descHtml = item.querySelector("description")?.textContent || "";
    const pubDate = item.querySelector("pubDate")?.textContent || "";
    const thumbnail = extractThumbnail(descHtml);
    const description = stripHtml(descHtml).slice(0, 300);

    if (title && link) {
      articles.push({ title, link, description, pubDate, source: sourceName, sourceLang, thumbnail });
    }
  });

  // Atom: <entry> elements
  if (articles.length === 0) {
    const entries = doc.querySelectorAll("entry");
    entries.forEach((entry) => {
      const title = entry.querySelector("title")?.textContent || "";
      const linkEl = entry.querySelector("link");
      const link = linkEl?.getAttribute("href") || "";
      const contentEl = entry.querySelector("content") || entry.querySelector("summary");
      const descHtml = contentEl?.textContent || "";
      const pubDate = entry.querySelector("published")?.textContent || entry.querySelector("updated")?.textContent || "";
      const thumbnail = extractThumbnail(descHtml);
      const description = stripHtml(descHtml).slice(0, 300);

      if (title && link) {
        articles.push({ title, link, description, pubDate, source: sourceName, sourceLang, thumbnail });
      }
    });
  }

  return articles;
}

function getFeedsForLang(lang: string): FeedEntry[] {
  const base = lang.split("-")[0];
  return FEEDS[base] || FEEDS.default;
}

export function getCachedNews(language?: string): NewsArticle[] | null {
  const key = `news_${language || "en"}`;
  const entry = cache.get(key);
  return entry?.data ?? null;
}

export async function getNews(language?: string): Promise<NewsArticle[]> {
  const lang = language || "en";
  const cacheKey = `news_${lang}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const feeds = getFeedsForLang(lang);

  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const response = await fetch(feed.url, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`${feed.name}: ${response.status}`);
      const xml = await response.text();
      return parseFeed(xml, feed.name, feed.lang);
    })
  );

  const articles: NewsArticle[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      articles.push(...result.value);
    }
  }

  articles.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );

  const seen = new Set<string>();
  const unique = articles.filter((a) => {
    if (seen.has(a.link)) return false;
    seen.add(a.link);
    return true;
  });

  const data = unique.slice(0, 15);

  if (data.length > 0) {
    cache.set(cacheKey, { data, timestamp: Date.now() });
  }

  return data;
}

import { logger } from "./logger";

const CACHE = new Map<string, string>();

export async function translateText(text: string, targetLang: string): Promise<string> {
  const cacheKey = `${targetLang}:${text.slice(0, 200)}`;
  if (CACHE.has(cacheKey)) return CACHE.get(cacheKey)!;

  const url = "https://translate.googleapis.com/translate_a/single"
    + "?client=gtx&sl=auto&tl=" + targetLang + "&dt=t&q=" + encodeURIComponent(text.slice(0, 5000));

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const json = await response.json();
    const result = json[0]?.map((segment: any) => segment[0]).join("") || text;
    CACHE.set(cacheKey, result);
    return result;
  } catch (err) {
    logger.warn(`[translate] Failed: ${err}`);
    throw new Error("Translation failed");
  }
}

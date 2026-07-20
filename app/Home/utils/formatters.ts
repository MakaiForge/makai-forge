export const GOOGLE_TRANSLATE_BASE = "https://translate.google.com/translate";

export function makeTranslateUrl(url: string, lang: string): string {
  const params = new URLSearchParams({
    hl: lang,
    tl: lang,
    sl: "auto",
    u: url,
  });
  return `${GOOGLE_TRANSLATE_BASE}?${params.toString()}`;
}

export function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "Agora mesmo";
  if (hours < 24) return `Há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Há ${days}d`;
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
  });
}

export function formatEndDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

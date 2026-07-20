export function getFaviconUrl(url: string): string {
  try { return `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico`; }
  catch { return ""; }
}

export function getDomain(url: string): string {
  try { return new URL(url).hostname; }
  catch { return ""; }
}

export const CHROME_MENU_ITEMS: Array<{ label: string; url: string } | { divider: true }> = [
  { label: "Configurações", url: "chrome://settings" },
  { label: "Extensões", url: "chrome://extensions" },
  { label: "Favoritos", url: "chrome://bookmarks" },
  { label: "Histórico", url: "chrome://history" },
  { label: "Transferências", url: "chrome://downloads" },
  { divider: true as const },
  { label: "Sobre o Chrome", url: "chrome://version" },
];

export function getRelativeCoordinates(screen: HTMLImageElement | null, clientX: number, clientY: number) {
  if (!screen) return { x: 0, y: 0 };
  const rect = screen.getBoundingClientRect();
  const relX = clientX - rect.left;
  const relY = clientY - rect.top;

  if (!screen.complete || screen.naturalWidth === 0) {
    return { x: Math.round(relX), y: Math.round(relY) };
  }

  const canvasW = rect.width;
  const canvasH = rect.height;
  const natW = screen.naturalWidth;
  const natH = screen.naturalHeight;

  const scale = Math.min(canvasW / natW, canvasH / natH);
  const dx = (canvasW - natW * scale) / 2;
  const dy = (canvasH - natH * scale) / 2;

  const imgX = (relX - dx) / scale;
  const imgY = (relY - dy) / scale;

  const kX = rect.width / natW;
  const kY = rect.height / natH;

  return {
    x: Math.round(Math.max(0, imgX * kX)),
    y: Math.round(Math.max(0, imgY * kY)),
  };
}

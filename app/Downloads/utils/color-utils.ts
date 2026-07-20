function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const r = Number.parseInt(h.substring(0, 2), 16) || 0;
  const g = Number.parseInt(h.substring(2, 4), 16) || 0;
  const b = Number.parseInt(h.substring(4, 6), 16) || 0;
  return [r, g, b];
}

function isTooCloseRGB(a: string, b: string, threshold: number): boolean {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const distance = Math.sqrt(
    Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2)
  );
  return distance < threshold;
}

const CHART_BACKGROUND_COLOR = "#1a1a1a";
const COLOR_DISTANCE_THRESHOLD = 28;
const FALLBACK_CHART_COLOR = "#fff";

export function pickChartColor(dominant?: string): string {
  if (!dominant || typeof dominant !== "string" || !dominant.startsWith("#")) {
    return FALLBACK_CHART_COLOR;
  }

  if (
    isTooCloseRGB(dominant, CHART_BACKGROUND_COLOR, COLOR_DISTANCE_THRESHOLD)
  ) {
    return FALLBACK_CHART_COLOR;
  }

  return dominant;
}

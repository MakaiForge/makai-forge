import { useEffect, useState } from "react";

const cache = new Map<string, string | null>();

async function fetchIconUrl(iconPath: string | null | undefined): Promise<string | null> {
  if (!iconPath) return null;
  const filename = iconPath.split("/").pop();
  if (!filename) return null;
  if (cache.has(filename)) return cache.get(filename) ?? null;
  const url = await window.electron.getAchievementIconUrl(iconPath);
  cache.set(filename, url);
  return url;
}

interface BadgeIconProps {
  iconPath: string | null | undefined;
  size: number;
}

export function BadgeIcon({ iconPath, size }: BadgeIconProps) {
  const [url, setUrl] = useState<string | null | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    fetchIconUrl(iconPath).then((result) => {
      if (!cancelled) setUrl(result);
    });
    return () => { cancelled = true; };
  }, [iconPath]);

  if (url === "loading") {
    return <span style={{ fontSize: size }}>🏆</span>;
  }

  if (!url) {
    return <span style={{ fontSize: size }}>🏆</span>;
  }

  return <img src={url} alt="" width={size} height={size} />;
}

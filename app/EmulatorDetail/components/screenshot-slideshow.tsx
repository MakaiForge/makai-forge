import { useEffect, useState } from "react";
import { useScreenshots } from "../hooks/use-screenshots";

interface ScreenshotSlideshowProps {
  platformSlug: string;
}

export function ScreenshotSlideshow({ platformSlug }: ScreenshotSlideshowProps) {
  const { current, total } = useScreenshots(platformSlug);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [current]);

  if (total === 0) return null;

  return (
    <div className="emulator-detail__slideshow">
      <div className="emulator-detail__slideshow-bg" />
      <img
        key={current}
        src={current}
        alt=""
        className={`emulator-detail__slideshow-img ${loaded ? "loaded" : ""}`}
        onLoad={() => setLoaded(true)}
      />
      <div className="emulator-detail__slideshow-overlay" />
    </div>
  );
}

import { ExternalLink } from "lucide-react";
import freeromsImg from "@renderer/assets/freeroms.png";
import coolromImg from "@renderer/assets/coolrom.png";
import romsgamesImg from "@renderer/assets/romsgames.png";

const DEFAULT_IMAGES: Record<string, string> = {
  "FreeROMs": freeromsImg,
  "CoolROM": coolromImg,
  "ROMs Games": romsgamesImg,
};

interface SitePreviewProps {
  name: string;
  url: string;
  imageUrl?: string;
}

export function SitePreview({ name, url, imageUrl }: SitePreviewProps) {
  const imgSrc = imageUrl || DEFAULT_IMAGES[name];

  return (
    <button
      type="button"
      className="emulator-detail__site-card"
      onClick={() => window.electron.openExternal(url)}
      title={`Abrir ${name}`}
    >
      <div className="emulator-detail__site-card-image">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={name}
            loading="lazy"
          />
        ) : (
          <div className="emulator-detail__site-card-placeholder">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="emulator-detail__site-card-info">
        <strong>{name}</strong>
        <span>{new URL(url).hostname}</span>
      </div>
      <div className="emulator-detail__site-card-icon">
        <ExternalLink size={14} />
      </div>
    </button>
  );
}

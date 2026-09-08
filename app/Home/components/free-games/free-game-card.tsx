import type { FreeGameData } from "@types";
import { formatEndDate } from "../../utils/formatters";

interface FreeGameCardProps {
  game: FreeGameData;
  onOpenUrl: (url: string) => void;
}

export function FreeGameCard({ game, onOpenUrl }: FreeGameCardProps) {
  return (
    <div className="home__free-card" onClick={() => onOpenUrl(game.url)}>
      {game.image && (
        <img
          src={game.image}
          alt={game.title}
          className="home__free-img"
          loading="lazy"
        />
      )}
      <div className="home__free-info">
        <span className="home__free-badge">Grátis</span>
        <h4 className="home__free-title">{game.title}</h4>
        <span className="home__free-store">{game.store}</span>
        <span className="home__free-ends">Até {formatEndDate(game.endsAt)}</span>
      </div>
    </div>
  );
}

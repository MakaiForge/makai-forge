import type { FreeGameData } from "@types";
import { FreeGameCard } from "./free-game-card";
import "./free-games.scss";

interface FreeGamesProps {
  games: FreeGameData[];
  onOpenUrl: (url: string) => void;
}

export function FreeGames({ games, onOpenUrl }: FreeGamesProps) {
  if (games.length === 0) return null;

  return (
    <section className="home__section">
      <h2 className="home__section-title">Jogos Grátis</h2>
      <div className="home__free-grid">
        {games.map((game, i) => (
          <FreeGameCard key={i} game={game} onOpenUrl={onOpenUrl} />
        ))}
      </div>
    </section>
  );
}

import type { DealData } from "@types";
import { DealCard } from "./deal-card";
import "./featured-deals.scss";

interface FeaturedDealsProps {
  deals: DealData[];
  onOpenUrl: (url: string) => void;
}

export function FeaturedDeals({ deals, onOpenUrl }: FeaturedDealsProps) {
  return (
    <section className="home__section">
      <h2 className="home__section-title">Promoções em Destaque</h2>
      {deals.length === 0 ? (
        <p className="home__empty">Nenhuma promoção disponível.</p>
      ) : (
        <div className="home__deals-grid">
          {deals.map((deal) => (
            <DealCard key={deal.steamAppId} deal={deal} onOpenUrl={onOpenUrl} />
          ))}
        </div>
      )}
    </section>
  );
}

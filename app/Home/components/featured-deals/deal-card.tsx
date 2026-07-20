import type { DealData } from "@types";

interface DealCardProps {
  deal: DealData;
  onOpenUrl: (url: string) => void;
}

export function DealCard({ deal, onOpenUrl }: DealCardProps) {
  const discount = Math.round(
    ((deal.normalPrice - deal.salePrice) / deal.normalPrice) * 100
  );

  return (
    <div className="home__deal-card" onClick={() => onOpenUrl(deal.dealUrl)}>
      <div className="home__deal-thumb-wrap">
        <img
          src={deal.thumb}
          alt={deal.title}
          className="home__deal-thumb"
          loading="lazy"
        />
        <span className="home__deal-badge">-{discount}%</span>
      </div>
      <div className="home__deal-info">
        <h4 className="home__deal-title">{deal.title}</h4>
        <div className="home__deal-row">
          <span className="home__deal-store">{deal.storeName}</span>
          <div className="home__deal-prices">
            <span className="home__deal-old">
              ${deal.normalPrice.toFixed(2)}
            </span>
            <span className="home__deal-new">
              ${deal.salePrice.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

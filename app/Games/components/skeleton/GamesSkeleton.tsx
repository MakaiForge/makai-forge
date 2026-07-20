import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

const CARD_COUNT = 6;

export function GamesSkeleton() {
  return (
    <div className="games__skeleton">
      <div className="games__section-header">
        <Skeleton width={80} height={18} />
        <Skeleton width={40} height={14} />
      </div>
      <div className="games__grid">
        {Array.from({ length: CARD_COUNT }).map((_, i) => (
          <div key={i} className="games__skeleton-card">
            <Skeleton height={0} style={{ paddingBottom: "46.7%", borderRadius: "12px 12px 0 0", display: "block" }} />
            <div style={{ padding: "8px 12px 12px" }}>
              <Skeleton height={14} width="70%" style={{ marginBottom: 6 }} />
              <Skeleton height={12} width="40%" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

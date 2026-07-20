import { useCallback, useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import type { NewsArticle } from "@types";

import { formatTimeAgo } from "../../utils/formatters";
import "./news-carousel.scss";

const INTERVAL_MS = 7000;

interface NewsCarouselProps {
  articles: NewsArticle[];
  onSelectArticle: (article: NewsArticle) => void;
}

export function NewsCarousel({ articles, onSelectArticle }: NewsCarouselProps) {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % articles.length);
    }, INTERVAL_MS);
  }, [articles.length]);

  useEffect(() => {
    if (articles.length > 1) startTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [articles.length, startTimer]);

  const goTo = (index: number) => {
    setCurrent(index);
    startTimer();
  };

  const goNext = () => goTo((current + 1) % articles.length);
  const goPrev = () => goTo((current - 1 + articles.length) % articles.length);

  if (articles.length === 0) return null;

  const article = articles[current];

  return (
    <div className="home__carousel">
      <div className="home__carousel-slide">
        <div className="home__carousel-content">
          <div className="home__carousel-meta">
            <span className="home__carousel-source">{article.source}</span>
            <span className="home__carousel-time">
              {formatTimeAgo(article.pubDate)}
            </span>
          </div>
          <h3 className="home__carousel-title">{article.title}</h3>
          <p className="home__carousel-desc">{article.description}</p>
          <button
            className="home__carousel-cta"
            onClick={() => onSelectArticle(article)}
          >
            Ler notícia
          </button>
        </div>

        {article.thumbnail && (
          <img
            src={article.thumbnail}
            alt=""
            className="home__carousel-img"
            loading="lazy"
          />
        )}
      </div>

      <button className="home__carousel-nav home__carousel-nav--prev" onClick={goPrev}>
        <CaretLeft size={20} />
      </button>
      <button className="home__carousel-nav home__carousel-nav--next" onClick={goNext}>
        <CaretRight size={20} />
      </button>

      <div className="home__carousel-dots">
        {articles.slice(0, 8).map((_, i) => (
          <button
            key={i}
            className={`home__carousel-dot ${i === current ? "home__carousel-dot--active" : ""}`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </div>
  );
}

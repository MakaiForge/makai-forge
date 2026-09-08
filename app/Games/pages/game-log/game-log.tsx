import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import "./game-log.scss";

let lineCounter = 0;

export default function GameLog() {
  const { t } = useTranslation("game_launcher");
  const [searchParams] = useSearchParams();
  const shop = searchParams.get("shop") || "";
  const objectId = searchParams.get("objectId") || "";

  const [lineCount, setLineCount] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMatchCount, setSearchMatchCount] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<string[]>([]);
  const searchIdxRef = useRef<number[]>([]);
  const pendingAppendRef = useRef<boolean>(false);

  const appendLinesToDOM = useCallback((newLines: string[]) => {
    if (!contentRef.current || newLines.length === 0) return;

    const frag = document.createDocumentFragment();
    for (const line of newLines) {
      const num = ++lineCounter;
      const div = document.createElement("div");
      div.id = `log-line-${num}`;
      div.className = "game-log__line";
      div.innerHTML = `<span class="game-log__line-num">${num}</span><span class="game-log__line-text">${escapeHtml(line)}</span>`;
      frag.appendChild(div);
    }
    contentRef.current.appendChild(frag);

    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [autoScroll]);

  useEffect(() => {
    if (!shop || !objectId) return;

    window.electron.getGameLogLines(shop, objectId).then((initial) => {
      linesRef.current = initial;
      lineCounter = initial.length;
      setLineCount(initial.length);
      if (contentRef.current) {
        contentRef.current.innerHTML = "";
      }
      appendLinesToDOM(initial);
    });

    const unsubLog = window.electron.onGameLogLine((data) => {
      if (data.shop === shop && data.objectId === objectId) {
        linesRef.current.push(...data.lines);
        setLineCount(linesRef.current.length);
        if (!pendingAppendRef.current) {
          pendingAppendRef.current = true;
          requestAnimationFrame(() => {
            pendingAppendRef.current = false;
            appendLinesToDOM(data.lines);
          });
        }
      }
    });

    return () => {
      unsubLog();
    };
  }, [shop, objectId, appendLinesToDOM]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lineCount, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(atBottom);
  }, []);

  useEffect(() => {
    if (!searchTerm) {
      setSearchMatchCount(0);
      setCurrentMatchIndex(0);
      searchIdxRef.current = [];
      return;
    }

    const term = searchTerm.toLowerCase();
    const matches = linesRef.current.reduce<number[]>((acc, line, i) => {
      if (line.toLowerCase().includes(term)) acc.push(i);
      return acc;
    }, []);
    searchIdxRef.current = matches;
    setSearchMatchCount(matches.length);
    setCurrentMatchIndex(0);
  }, [searchTerm, lineCount]);

  const scrollToMatch = useCallback((index: number) => {
    const lineEl = document.getElementById(`log-line-${index + 1}`);
    if (lineEl) {
      lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const handleSearchNext = useCallback(() => {
    const matches = searchIdxRef.current;
    if (matches.length === 0) return;
    const next = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(next);
    scrollToMatch(matches[next]);
  }, [currentMatchIndex, scrollToMatch]);

  const handleSearchPrev = useCallback(() => {
    const matches = searchIdxRef.current;
    if (matches.length === 0) return;
    const prev =
      currentMatchIndex <= 0 ? matches.length - 1 : currentMatchIndex - 1;
    setCurrentMatchIndex(prev);
    scrollToMatch(matches[prev]);
  }, [currentMatchIndex, scrollToMatch]);

  const handleCopy = useCallback(async () => {
    const text = linesRef.current.join("\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }, []);

  const handleSave = useCallback(() => {
    const text = linesRef.current.join("\n");
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `game-log-${objectId || "unknown"}-${Date.now()}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [objectId]);

  const handleClear = useCallback(async () => {
    if (shop && objectId) {
      await window.electron.clearGameLog(shop, objectId);
    }
    linesRef.current = [];
    lineCounter = 0;
    setLineCount(0);
    if (contentRef.current) {
      contentRef.current.innerHTML = "";
    }
  }, [shop, objectId]);

  const handleNavigateBack = useCallback(() => {
    window.close();
  }, []);

  return (
    <div className="game-log">
      <div className="game-log__toolbar">
        <div className="game-log__toolbar-left">
          <button
            className="game-log__btn"
            onClick={handleNavigateBack}
            title="Voltar"
          >
            ← Voltar
          </button>
          <span className="game-log__title">
            Log do Jogo {objectId ? `(${objectId})` : ""}
          </span>
          <span className="game-log__line-count">
            {lineCount} linhas
          </span>
        </div>
        <div className="game-log__toolbar-center">
          <input
            className="game-log__search-input"
            type="text"
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchMatchCount > 0 && (
            <span className="game-log__search-info">
              {currentMatchIndex + 1}/{searchMatchCount}
            </span>
          )}
          <button
            className="game-log__btn"
            onClick={handleSearchPrev}
            disabled={searchMatchCount === 0}
            title="Anterior"
          >
            ↑
          </button>
          <button
            className="game-log__btn"
            onClick={handleSearchNext}
            disabled={searchMatchCount === 0}
            title="Próximo"
          >
            ↓
          </button>
        </div>
        <div className="game-log__toolbar-right">
          <button
            className="game-log__btn"
            onClick={handleCopy}
            disabled={lineCount === 0}
            title="Copiar tudo"
          >
            Copiar
          </button>
          <button
            className="game-log__btn"
            onClick={handleSave}
            disabled={lineCount === 0}
            title="Salvar como arquivo"
          >
            Salvar
          </button>
          <button
            className="game-log__btn"
            onClick={handleClear}
            disabled={lineCount === 0}
            title="Limpar log"
          >
            Limpar
          </button>
          <button
            className={`game-log__btn ${autoScroll ? "game-log__btn--active" : ""}`}
            onClick={() => setAutoScroll(!autoScroll)}
            title="Auto-scroll"
          >
            Auto ↓
          </button>
        </div>
      </div>
      <div
        className="game-log__content"
        ref={containerRef}
        onScroll={handleScroll}
      >
        <div ref={contentRef}>
          {lineCount === 0 && (
            <div className="game-log__empty">
              Nenhum log disponível. Inicie o jogo para gerar logs.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

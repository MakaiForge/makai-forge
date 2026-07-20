import { useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight, ArrowSquareOut } from "@phosphor-icons/react";

import "./BrowserView.scss";

const CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

interface BrowserViewProps {
  url: string;
}

export function BrowserView({ url }: BrowserViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<any>(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoFwd, setCanGoFwd] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const wv: any = document.createElement("webview");
    wv.src = url;
    wv.setAttribute("allowpopups", "");
    wv.setAttribute("useragent", CHROME_UA);
    wv.setAttribute("partition", "persist:browser");
    wv.setAttribute(
      "webpreferences",
      "contextIsolation=yes, nodeIntegration=no, javascript=yes"
    );
    wv.style.width = "100%";
    wv.style.height = "100%";

    wv.addEventListener("did-navigate", () => {
      setCurrentUrl(wv.getURL());
      setCanGoBack(wv.canGoBack());
      setCanGoFwd(wv.canGoForward());
      setLoading(false);
    });
    wv.addEventListener("did-navigate-in-page", () => {
      setCurrentUrl(wv.getURL());
      setCanGoBack(wv.canGoBack());
      setCanGoFwd(wv.canGoForward());
      setLoading(false);
    });
    wv.addEventListener("did-stop-loading", () => setLoading(false));
    wv.addEventListener("did-start-navigation", () => setLoading(true));

    containerRef.current.appendChild(wv);
    webviewRef.current = wv;

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [url]);

  const displayUrl = currentUrl || url;

  return (
    <div className="browser-view">
      <div className="browser-view__toolbar">
        <button
          className="browser-view__btn"
          onClick={() => webviewRef.current?.goBack()}
          disabled={!canGoBack}
          title="Voltar"
        >
          <CaretLeft size={14} />
        </button>
        <button
          className="browser-view__btn"
          onClick={() => webviewRef.current?.goForward()}
          disabled={!canGoFwd}
          title="Avançar"
        >
          <CaretRight size={14} />
        </button>

        <div className="browser-view__url">
          {loading && <span className="browser-view__spinner" />}
          <span>{displayUrl}</span>
        </div>

        <button
          className="browser-view__btn"
          onClick={() => window.electron.openExternal(displayUrl)}
          title="Abrir no navegador"
        >
          <ArrowSquareOut size={14} />
        </button>
      </div>

      <div ref={containerRef} className="browser-view__content" />
    </div>
  );
}

export function BrowserViewEmpty({
  message,
  hint,
}: {
  message?: string;
  hint?: string;
}) {
  return (
    <div className="browser-view__empty">
      <p>{message || "Navegador"}</p>
      <span>{hint || "Clique em um link para abrir aqui"}</span>
    </div>
  );
}

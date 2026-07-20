import { useEffect, useRef } from "react";

interface Props {
  mirrorId: string;
}

export function BrowserDebugBar({ mirrorId }: Props) {
  const frameCountRef = useRef(0);
  const lastLenRef = useRef(0);
  const frameElRef = useRef<HTMLSpanElement>(null);
  const lenElRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const cleanup = window.electron.onChromeScreencastFrame((frame) => {
      if (mirrorId && frame.mirrorId !== mirrorId) return;
      frameCountRef.current++;
      lastLenRef.current = frame?.data?.length || 0;
      if (frameElRef.current) frameElRef.current.textContent = String(frameCountRef.current);
      if (lenElRef.current) lenElRef.current.textContent = (lastLenRef.current / 1024).toFixed(1);
    });
    return () => cleanup();
  }, [mirrorId]);

  return (
    <div style={{
      height: 20,
      background: "rgba(0,0,0,0.6)",
      color: "rgba(255,255,255,0.4)",
      fontFamily: "monospace",
      fontSize: 11,
      display: "flex",
      alignItems: "center",
      padding: "0 8px",
      gap: 12,
      flexShrink: 0,
      userSelect: "none",
    }}>
      <span>frames: <span ref={frameElRef}>0</span></span>
      <span>|</span>
      <span>last: <span ref={lenElRef}>0</span> KB</span>
    </div>
  );
}

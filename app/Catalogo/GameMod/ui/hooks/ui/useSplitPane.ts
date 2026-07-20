import { useRef, useCallback } from "react";

export function useSplitPane(containerRef: React.RefObject<HTMLDivElement | null>) {
  const dividerDragRef = useRef(false);
  const startX = useRef(0);
  const startLeftW = useRef(0);

  const MIN_LEFT = 200;
  const MIN_RIGHT = 240;

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    dividerDragRef.current = true;
    startX.current = e.clientX;
    const left = containerRef.current?.querySelector(".mod-manager__left") as HTMLElement;
    if (left) startLeftW.current = left.offsetWidth;
    const r = containerRef.current?.querySelector(".mod-manager__right") as HTMLElement;
    document.addEventListener("mousemove", onDividerMouseMove);
    document.addEventListener("mouseup", onDividerMouseUp);
  }, [containerRef]);

  const onDividerMouseMove = useCallback((e: MouseEvent) => {
    if (!dividerDragRef.current || !containerRef.current) return;
    const dx = e.clientX - startX.current;
    const containerW = containerRef.current.offsetWidth;
    let newW = startLeftW.current + dx;
    newW = Math.max(MIN_LEFT, Math.min(containerW - MIN_RIGHT, newW));
    const pct = (newW / containerW) * 100;
    containerRef.current.style.setProperty("--left-width", `${pct}%`);
  }, [containerRef]);

  const onDividerMouseUp = useCallback(() => {
    dividerDragRef.current = false;
    document.removeEventListener("mousemove", onDividerMouseMove);
    document.removeEventListener("mouseup", onDividerMouseUp);
  }, [onDividerMouseMove]);

  return { onDividerMouseDown };
}

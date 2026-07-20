import { useState, useCallback } from "react";

export function useModLog() {
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    try { (window.electron as any).modBridgeLog?.("info", msg); } catch {}
  }, []);

  return { log, addLog };
}

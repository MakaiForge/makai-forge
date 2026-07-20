import { useEffect, useState } from "react";

export function useRunnersRunning() {
  const [running, setRunning] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub1 = window.electron.onRunnerStarted((runnerId) => {
      setRunning((prev) => new Set(prev).add(runnerId));
    });
    const unsub2 = window.electron.onRunnerStopped((runnerId) => {
      setRunning((prev) => {
        const next = new Set(prev);
        next.delete(runnerId);
        return next;
      });
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  return running;
}

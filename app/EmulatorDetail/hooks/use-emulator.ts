import { useEffect, useState } from "react";
import type { RunnerDefinition } from "@emulators/types";

export function useEmulator(runnerId: string | undefined) {
  const [runner, setRunner] = useState<RunnerDefinition | null>(null);
  const [status, setStatus] = useState<{ installedVersion?: string } | null>(null);
  const [icon, setIcon] = useState<string | null>(null);

  useEffect(() => {
    if (!runnerId) return;
    window.electron.getRunners().then((all) => {
      const found = all.find((r: RunnerDefinition) => r.id === runnerId);
      if (found) setRunner(found);
    });
    window.electron.getRunnerStatus(runnerId).then(setStatus);
    window.electron.getRunnerIcon(runnerId).then(setIcon);
  }, [runnerId]);

  return { runner, status, icon };
}

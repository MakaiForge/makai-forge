import { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "./redux";
import { setInstalledRunners, setRunnerIcons } from "@renderer/features";

export function useRunners() {
  const dispatch = useAppDispatch();
  const installed = useAppSelector((state) => state.runners.installed);
  const icons = useAppSelector((state) => state.runners.icons);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [runners, statuses] = await Promise.all([
      window.electron.getRunners(),
      window.electron.getAllRunnersStatus(),
    ]);
    const entries = runners
      .filter((r) => statuses[r.id]?.isInstalled)
      .map((r) => ({
        id: r.id,
        humanName: r.humanName,
        isInstalled: true,
        installedVersion: statuses[r.id]?.installedVersion,
      }));
    dispatch(setInstalledRunners(entries));

    const iconMap: Record<string, string | null> = {};
    for (const r of runners) {
      iconMap[r.id] = await window.electron.getRunnerIcon(r.id);
    }
    dispatch(setRunnerIcons(iconMap));
    setLoading(false);
  }, [dispatch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { installed, icons, loading, refresh };
}

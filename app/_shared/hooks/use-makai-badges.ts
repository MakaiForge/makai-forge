import { useEffect, useRef, useState } from "react";
import type { SiteBadge } from "@types";

export function useMakaiBadges() {
  const [badges, setBadges] = useState<SiteBadge[]>([]);
  const [points, setPoints] = useState(0);
  const lastBadgeIds = useRef<Set<number>>(new Set());
  const onNewBadgesRef = useRef<((badges: SiteBadge[]) => void) | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const poll = async () => {
      try {
        const auth = await window.electron.getMakaiAuth();
        if (!auth) return;

        const profile = await window.electron.getMakaiProfile();
        if (!profile) return;

        setBadges(profile.badges || []);
        setPoints(profile.points || 0);

        const currentIds = new Set((profile.badges || []).map((b: SiteBadge) => b.id));
        const newIds = [...currentIds].filter((id) => !lastBadgeIds.current.has(id));
        lastBadgeIds.current = currentIds;

        if (newIds.length > 0 && onNewBadgesRef.current) {
          const newBadges = (profile.badges || []).filter((b: SiteBadge) =>
            newIds.includes(b.id)
          );
          onNewBadgesRef.current(newBadges);
        }
      } catch {
        // silent
      }
    };

    interval = setInterval(poll, 15000);
    poll();

    return () => clearInterval(interval);
  }, []);

  return { badges, points, onNewBadges: (cb: (badges: SiteBadge[]) => void) => { onNewBadgesRef.current = cb; } };
}

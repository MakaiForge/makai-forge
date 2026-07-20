import { useEffect, useRef } from "react";
import { useToast } from "./use-toast";
import { useAppSelector } from "./redux";

export function useMakaiNotifications() {
  const { showSuccessToast } = useToast();
  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );
  const seenIds = useRef<Set<number>>(new Set());
  const seenBadgeIds = useRef<Set<number>>(new Set());
  const isPolling = useRef(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const poll = async () => {
      if (isPolling.current) return;
      isPolling.current = true;

      try {
        const auth = await window.electron.getMakaiAuth();
        if (!auth) return;

        // Poll notifications
        const result = await window.electron.getNotifications();
        if (result.notifications) {
          for (const notif of result.notifications) {
            if (notif.read) continue;
            if (seenIds.current.has(notif.id)) continue;
            seenIds.current.add(notif.id);
            showSuccessToast(notif.message, "", 4000);
          }
        }

        // Poll badges for new unlocks (only if user wants it)
        const showAchievements =
          userPreferences?.achievementNotificationsEnabled ?? true;
        if (showAchievements) {
          const profile = await window.electron.getMakaiProfile();
          if (profile?.badges) {
            for (const badge of profile.badges) {
              if (seenBadgeIds.current.has(badge.id)) continue;
              seenBadgeIds.current.add(badge.id);
              showSuccessToast(
                `Nova conquista: ${badge.name}`,
                badge.description,
                5000
              );
            }
          }
        }
      } catch {
        // silent
      } finally {
        isPolling.current = false;
      }
    };

    // Get initial badge IDs so we don't show popups for existing badges
    window.electron.getMakaiProfile().then((profile) => {
      if (profile?.badges) {
        for (const badge of profile.badges) {
          seenBadgeIds.current.add(badge.id);
        }
      }
    });

    interval = setInterval(poll, 15000);
    poll();

    return () => clearInterval(interval);
  }, [showSuccessToast, userPreferences?.achievementNotificationsEnabled]);
}

import { useNavigate } from "react-router-dom";
import { BellIcon } from "@primer/octicons-react";
import { useAppSelector, useUserDetails } from "@renderer/hooks";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import SteamLogo from "@renderer/assets/steam-logo.svg?react";
import { Avatar } from "../avatar/avatar";
import { logger } from "@renderer/logger";
import { useMakaiBadges } from "@renderer/hooks/use-makai-badges";
import { BadgeIcon } from "@renderer/utils/badge-icons";
import type { NotificationCountResponse } from "@types";
import "./sidebar-profile.scss";

const LEVEL_THRESHOLDS = [
  { level: 1, threshold: 0 },
  { level: 10, threshold: 10000 },
  { level: 20, threshold: 20000 },
  { level: 30, threshold: 30000 },
  { level: 40, threshold: 40000 },
  { level: 50, threshold: 50000 },
  { level: 60, threshold: 60000 },
  { level: 70, threshold: 70000 },
  { level: 80, threshold: 80000 },
  { level: 90, threshold: 90000 },
  { level: 100, threshold: 250000 },
];

function computeLevel(points: number): number {
  let level = 1;
  for (const { level: l, threshold } of LEVEL_THRESHOLDS) {
    if (points >= threshold) level = l;
  }
  return level;
}

export function SidebarProfile() {
  const navigate = useNavigate();

  const { t } = useTranslation("sidebar");
  const { t: tBadges } = useTranslation("badges");

  const { userDetails } = useUserDetails();

  const { gameRunning } = useAppSelector((state) => state.gameRunning);

  const [notificationCount, setNotificationCount] = useState(0);
  const apiNotificationCountRef = useRef(0);
  const hasFetchedInitialCount = useRef(false);

  const { badges, points } = useMakaiBadges();

  const pinnedBadges = useMemo(
    () => badges.filter((b) => b.pinned),
    [badges]
  );

  const level = useMemo(() => computeLevel(points), [points]);

  const fetchLocalNotificationCount = useCallback(async () => {
    try {
      const localCount = await window.electron.getLocalNotificationsCount();
      setNotificationCount(localCount + apiNotificationCountRef.current);
    } catch (error) {
      logger.error("Failed to fetch local notification count", error);
    }
  }, []);

  const fetchApiNotificationCount = useCallback(async () => {
    try {
      const response =
        await window.electron.forgerApi.get<NotificationCountResponse>(
          "/profile/notifications/count",
          { needsAuth: true }
        );
      apiNotificationCountRef.current = response.count;
    } catch {
      // Ignore API errors
    }
    fetchLocalNotificationCount();
  }, [fetchLocalNotificationCount]);

  useEffect(() => {
    fetchLocalNotificationCount();
  }, [fetchLocalNotificationCount]);

  useEffect(() => {
    if (userDetails && !hasFetchedInitialCount.current) {
      hasFetchedInitialCount.current = true;
      fetchApiNotificationCount();
    } else if (!userDetails) {
      hasFetchedInitialCount.current = false;
      apiNotificationCountRef.current = 0;
      fetchLocalNotificationCount();
    }
  }, [userDetails, fetchApiNotificationCount, fetchLocalNotificationCount]);

  useEffect(() => {
    const unsubscribe = window.electron.onLocalNotificationCreated(() => {
      fetchLocalNotificationCount();
    });

    return () => unsubscribe();
  }, [fetchLocalNotificationCount]);

  useEffect(() => {
    const handleNotificationsChange = () => {
      fetchLocalNotificationCount();
    };

    window.addEventListener("notificationsChanged", handleNotificationsChange);
    return () => {
      window.removeEventListener(
        "notificationsChanged",
        handleNotificationsChange
      );
    };
  }, [fetchLocalNotificationCount]);

  useEffect(() => {
    const unsubscribe = window.electron.onSyncNotificationCount(
      (notification) => {
        apiNotificationCountRef.current = notification.notificationCount;
        fetchLocalNotificationCount();
      }
    );

    return () => unsubscribe();
  }, [fetchLocalNotificationCount]);

  const handleProfileClick = () => {
    navigate("/settings");
  };

  const notificationsButton = useMemo(() => {
    return (
      <button
        type="button"
        className="sidebar-profile__notification-button"
        onClick={() => navigate("/notifications")}
        title={t("notifications")}
      >
        {notificationCount > 0 && (
          <small className="sidebar-profile__notification-button-badge">
            {notificationCount > 99 ? "99+" : notificationCount}
          </small>
        )}

        <BellIcon size={16} />
      </button>
    );
  }, [t, notificationCount, navigate]);

  const gameRunningDetails = () => {
    if (!userDetails || !gameRunning) return null;

    if (gameRunning.iconUrl) {
      return (
        <img
          className="sidebar-profile__game-running-icon"
          alt={gameRunning.title}
          width={24}
          src={gameRunning.iconUrl}
        />
      );
    }

    return <SteamLogo />;
  };

  return (
    <div className="sidebar-profile">
      <button
        type="button"
        className="sidebar-profile__button"
        onClick={handleProfileClick}
      >
        <div className="sidebar-profile__button-content">
          <Avatar
            size={35}
            src={userDetails?.profileImageUrl}
            alt={userDetails?.displayName}
          />

          <div className="sidebar-profile__button-information">
            <p className="sidebar-profile__button-title">
              {userDetails ? userDetails.displayName : t("settings")}
            </p>

            {userDetails && (
              <div className="sidebar-profile__button-meta-row">
                {pinnedBadges.length > 0 && (
                  <div className="sidebar-profile__badges-row">
                    {pinnedBadges.slice(0, 3).map((b) => (
                      <span key={b.id} className="sidebar-profile__badge-icon" title={tBadges(`${b.id}.name`, { defaultValue: b.name })}>
                        <BadgeIcon iconPath={b.icon} size={14} />
                      </span>
                    ))}
                  </div>
                )}
                <small className="sidebar-profile__level">
                  Nv.{level} — {points}pts
                </small>
              </div>
            )}

            {userDetails && gameRunning && (
              <div className="sidebar-profile__button-game-running-title">
                <small>{gameRunning.title}</small>
              </div>
            )}
          </div>

          {gameRunningDetails()}
        </div>
      </button>

      {notificationsButton}
    </div>
  );
}

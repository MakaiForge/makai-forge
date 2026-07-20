import { userProfileContext } from "@renderer/context";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ProfileHero } from "../profile-hero/profile-hero";
import { useAppDispatch } from "@renderer/hooks";
import { setHeaderTitle } from "@renderer/features";
import { useTranslation } from "react-i18next";
import { LockedProfile } from "./locked-profile";
import { ReportProfile } from "../report-profile/report-profile";
import { BadgesBox } from "./badges-box";
import { FriendsBox, FriendsBoxAddButton } from "./friends-box";
import { RecentGamesBox } from "./recent-games-box";
import { UserStatsBox } from "./user-stats-box";
import { ProfileSection } from "../profile-section/profile-section";
import { GAME_STATS_ANIMATION_DURATION_IN_MS } from "./profile-animations";
import { LibraryTab } from "./library-tab";
import "./profile-content.scss";

type SortOption = "playtime" | "playedRecently";

export function ProfileContent() {
  const {
    userProfile,
    isMe,
    userStats,
    libraryGames,
    pinnedGames,
    getUserLibraryGames,
    loadMoreLibraryGames,
    hasMoreLibraryGames,
    isLoadingLibraryGames,
  } = useContext(userProfileContext);
  const [statsIndex, setStatsIndex] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>("playedRecently");

  const dispatch = useAppDispatch();

  const { t } = useTranslation("user_profile");

  useEffect(() => {
    dispatch(setHeaderTitle(""));

    if (userProfile) {
      dispatch(setHeaderTitle(userProfile.displayName));
    }
  }, [userProfile, dispatch]);

  useEffect(() => {
    if (userProfile) {
      getUserLibraryGames(sortBy, true);
    }
  }, [sortBy, getUserLibraryGames, userProfile]);

  const handleLoadMore = useCallback(() => {
    if (hasMoreLibraryGames && !isLoadingLibraryGames) {
      loadMoreLibraryGames(sortBy);
    }
  }, [
    hasMoreLibraryGames,
    isLoadingLibraryGames,
    loadMoreLibraryGames,
    sortBy,
  ]);

  useEffect(() => {
    const interval = window.setInterval(
      () => setStatsIndex((index) => index + 1),
      GAME_STATS_ANIMATION_DURATION_IN_MS
    );

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const usersAreFriends = useMemo(() => {
    return userProfile?.relation?.status === "ACCEPTED";
  }, [userProfile]);

  const content = useMemo(() => {
    if (!userProfile) return null;

    const shouldLockProfile =
      userProfile.profileVisibility === "PRIVATE" ||
      (userProfile.profileVisibility === "FRIENDS" && !usersAreFriends);

    if (!isMe && shouldLockProfile) {
      return <LockedProfile />;
    }

    const hasGames = libraryGames.length > 0;
    const hasPinnedGames = pinnedGames.length > 0;
    const hasAnyGames = hasGames || hasPinnedGames;

    const shouldShowRightContent =
      hasAnyGames || userProfile.friends.length > 0 || isMe;

    return (
      <section className="profile-content__section">
        <div className="profile-content__main">
          <div className="profile-content__tab-panels">
            <LibraryTab
              sortBy={sortBy}
              onSortChange={setSortBy}
              pinnedGames={pinnedGames}
              libraryGames={libraryGames}
              hasMoreLibraryGames={hasMoreLibraryGames}
              statsIndex={statsIndex}
              userStats={userStats}
              onLoadMore={handleLoadMore}
              isMe={isMe}
            />
          </div>
        </div>

        {shouldShowRightContent && (
          <div className="profile-content__right-content">
            {userStats && (
              <ProfileSection title={t("stats")} defaultOpen={true}>
                <UserStatsBox />
              </ProfileSection>
            )}
            {userProfile?.badges.length > 0 && (
              <ProfileSection
                title={t("badges")}
                count={userProfile.badges.length}
                defaultOpen={true}
              >
                <BadgesBox />
              </ProfileSection>
            )}
            {userProfile?.recentGames.length > 0 && (
              <ProfileSection title={t("activity")} defaultOpen={true}>
                <RecentGamesBox />
              </ProfileSection>
            )}
            {(userProfile?.friends.length > 0 || isMe) && (
              <ProfileSection
                title={t("friends")}
                count={userStats?.friendsCount || userProfile.friends.length}
                action={<FriendsBoxAddButton />}
                defaultOpen={true}
              >
                <FriendsBox />
              </ProfileSection>
            )}
            <ReportProfile />
          </div>
        )}
      </section>
    );
  }, [
    userProfile,
    isMe,
    usersAreFriends,
    userStats,
    t,
    statsIndex,
    libraryGames,
    pinnedGames,

    sortBy,
  ]);

  return (
    <div>
      <ProfileHero />

      {content}
    </div>
  );
}

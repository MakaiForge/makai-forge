import { useEffect } from "react";
import { ProfileContent } from "./profile-content/profile-content";
import { SkeletonTheme } from "react-loading-skeleton";
import { UserProfileContextProvider } from "@context";
import { useParams } from "react-router-dom";
import "./profile.scss";

export default function Profile() {
  const { userId } = useParams();

  useEffect(() => {
    window.document.title = `Makai Forge — Perfil`;
  }, []);

  return (
    <UserProfileContextProvider userId={userId!}>
      <SkeletonTheme baseColor="#1c1c1c" highlightColor="#444">
        <div className="profile__wrapper">
          <ProfileContent />
        </div>
      </SkeletonTheme>
    </UserProfileContextProvider>
  );
}

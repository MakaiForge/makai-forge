import { useCallback, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "./redux";
import {
  setProfileBackground,
  setUserDetails,
  setFriendRequests,
  clearCollections,
} from "@renderer/features";
import type {
  FriendRequestAction,
  UpdateProfileRequest,
  UserDetails,
  FriendRequest,
} from "@types";

export function useUserDetails() {
  const dispatch = useAppDispatch();

  const { userDetails, profileBackground, friendRequests, friendRequestCount } =
    useAppSelector((state) => state.userDetails);

  const clearUserDetails = useCallback(async () => {
    dispatch(setUserDetails(null));
    dispatch(setProfileBackground(null));
    dispatch(clearCollections());

    globalThis.window.localStorage.removeItem("userDetails");
  }, [dispatch]);

  const signOut = useCallback(async () => {
    clearUserDetails();

    return globalThis.window.electron.signOut();
  }, [clearUserDetails]);

  const updateUserDetails = useCallback(
    async (userDetails: UserDetails) => {
      dispatch(setUserDetails(userDetails));
      globalThis.window.localStorage.setItem(
        "userDetails",
        JSON.stringify(userDetails)
      );
    },
    [dispatch]
  );

  const fetchUserDetails = useCallback(async () => {
    return globalThis.window.electron.getMe().then((userDetails) => {
      if (userDetails == null) {
        clearUserDetails();
      }

      window["userDetails"] = userDetails;

      return userDetails;
    });
  }, [clearUserDetails]);

  const patchUser = useCallback(
    async (values: UpdateProfileRequest) => {
      const response = await globalThis.window.electron.updateProfile(values);
      return updateUserDetails({
        ...response,
        username: userDetails?.username || "",
        subscription: userDetails?.subscription || null,
        karma: userDetails?.karma || 0,
      });
    },
    [
      updateUserDetails,
      userDetails?.username,
      userDetails?.subscription,
      userDetails?.karma,
    ]
  );

  const fetchFriendRequests = useCallback(async () => {
    return globalThis.window.electron.forgerApi
      .get<FriendRequest[]>("/profile/friend-requests")
      .then((friendRequests) => {
        dispatch(setFriendRequests(friendRequests));
      })
      .catch(() => {});
  }, [dispatch]);

  const sendFriendRequest = useCallback(
    async (userId: string) => {
      return globalThis.window.electron.forgerApi
        .post("/profile/friend-requests", {
          data: { friendCode: userId },
        })
        .then(() => fetchFriendRequests());
    },
    [fetchFriendRequests]
  );

  const updateFriendRequestState = useCallback(
    async (userId: string, action: FriendRequestAction) => {
      if (action === "CANCEL") {
        return globalThis.window.electron.forgerApi
          .delete(`/profile/friend-requests/${userId}`)
          .then(() => fetchFriendRequests());
      }

      return globalThis.window.electron.forgerApi
        .patch(`/profile/friend-requests/${userId}`, {
          data: {
            requestState: action,
          },
        })
        .then(() => fetchFriendRequests());
    },
    [fetchFriendRequests]
  );

  const undoFriendship = (userId: string) =>
    globalThis.window.electron.forgerApi.delete(
      `/profile/friend-requests/${userId}`
    );

  const blockUser = (userId: string) =>
    globalThis.window.electron.forgerApi.post(`/users/${userId}/block`);

  const unblockUser = (userId: string) =>
    globalThis.window.electron.forgerApi.post(`/users/${userId}/unblock`);

  const hasActiveSubscription = useMemo(() => {
    const expiresAt = new Date(userDetails?.subscription?.expiresAt ?? 0);
    return expiresAt > new Date();
  }, [userDetails]);

  return {
    userDetails,
    profileBackground,
    friendRequests,
    friendRequestCount,
    hasActiveSubscription,
    fetchUserDetails,
    signOut,
    clearUserDetails,
    updateUserDetails,
    patchUser,
    sendFriendRequest,
    fetchFriendRequests,
    updateFriendRequestState,
    blockUser,
    unblockUser,
    undoFriendship,
  };
}

import { ipcRenderer } from "electron";
import type { FriendRequestAction, UpdateProfileRequest, FriendRequestSync, NotificationSync } from "@types";
import type { AuthPage } from "@shared";

export const authAPI = {
  getMe: () => ipcRenderer.invoke("getMe"),
  updateProfile: (updateProfile: UpdateProfileRequest) =>
    ipcRenderer.invoke("updateProfile", updateProfile),
  processProfileImage: (imagePath: string) =>
    ipcRenderer.invoke("processProfileImage", imagePath),
  onSyncFriendRequests: (cb: (friendRequests: FriendRequestSync) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, friendRequests: FriendRequestSync) => cb(friendRequests);
    ipcRenderer.on("on-sync-friend-requests", listener);
    return () => ipcRenderer.removeListener("on-sync-friend-requests", listener);
  },
  onSyncNotificationCount: (cb: (notification: NotificationSync) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, notification: NotificationSync) => cb(notification);
    ipcRenderer.on("on-sync-notification-count", listener);
    return () => ipcRenderer.removeListener("on-sync-notification-count", listener);
  },
  updateFriendRequest: (userId: string, action: FriendRequestAction) =>
    ipcRenderer.invoke("updateFriendRequest", userId, action),

  getAuth: () => ipcRenderer.invoke("getAuth"),
  signOut: () => ipcRenderer.invoke("signOut"),
  openAuthWindow: (page: AuthPage) =>
    ipcRenderer.invoke("openAuthWindow", page),
  getSessionHash: () => ipcRenderer.invoke("getSessionHash"),
  onSignIn: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("on-signin", listener);
    return () => ipcRenderer.removeListener("on-signin", listener);
  },
  onAccountUpdated: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("on-account-updated", listener);
    return () => ipcRenderer.removeListener("on-account-updated", listener);
  },
  onSignOut: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("on-signout", listener);
    return () => ipcRenderer.removeListener("on-signout", listener);
  },
};

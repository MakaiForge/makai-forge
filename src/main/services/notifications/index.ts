import { Notification } from "electron";
import { t } from "i18next";
import trayIcon from "@assets/assets/icons/app/tray-icon.png?asset";
import fs from "node:fs";
import axios from "axios";
import path from "node:path";
import { logger } from "../logger";
import type { Game, UserPreferences, UserProfile } from "@types";
import { db, storeKeys } from "@main/store";
import { restartAndInstallUpdate } from "@bootstrap/autoupdater/restart-and-install-update";
import { SystemPath } from "../system-path";
import { processProfileImage } from "@main/events/profile/process-profile-image";
import { LocalNotificationManager } from "./local-notifications";

const getStaticImage = async (path: string) => {
  return processProfileImage(path, "jpg")
    .then((response) => response.imagePath)
    .catch(() => path);
};

async function downloadImage(url: string | null) {
  if (!url) return undefined;
  if (!url.startsWith("http")) return undefined;

  const fileName = url.split("/").pop()!;
  const outputPath = path.join(SystemPath.getPath("temp"), fileName);
  const writer = fs.createWriteStream(outputPath);

  const response = await axios.get(url, {
    responseType: "stream",
  });

  response.data.pipe(writer);

  return new Promise<string | undefined>((resolve) => {
    writer.on("finish", async () => {
      const staticImagePath = await getStaticImage(outputPath);
      resolve(staticImagePath);
    });
    writer.on("error", () => {
      logger.error("Failed to download image", { url });
      resolve(undefined);
    });
  });
}

export const publishDownloadCompleteNotification = async (game: Game) => {
  const userPreferences = await db.get<string, UserPreferences>(
    storeKeys.userPreferences,
    {
      valueEncoding: "json",
    }
  );

  const title = t("download_complete", { ns: "notifications" });
  const body = t("game_ready_to_install", {
    ns: "notifications",
    title: game.title,
  });

  if (userPreferences?.downloadNotificationsEnabled) {
    new Notification({
      title,
      body,
      icon: await downloadImage(game.iconUrl),
    }).show();
  }

  // Create local notification
  await LocalNotificationManager.createNotification(
    "DOWNLOAD_COMPLETE",
    title,
    body,
    {
      pictureUrl: game.iconUrl,
      url: `/game/${game.shop}/${game.objectId}`,
    }
  );
};

export const publishNotificationUpdateReadyToInstall = async (
  version: string
) => {
  const title = t("new_update_available", {
    ns: "notifications",
    version,
  });
  const body = t("restart_to_install_update", {
    ns: "notifications",
  });

  new Notification({
    title,
    body,
    icon: trayIcon,
  })
    .on("click", () => {
      restartAndInstallUpdate();
    })
    .show();

  // Create local notification
  await LocalNotificationManager.createNotification(
    "UPDATE_AVAILABLE",
    title,
    body
  );
};

export const publishNewFriendRequestNotification = async (
  user: UserProfile
) => {
  const userPreferences = await db.get<string, UserPreferences | null>(
    storeKeys.userPreferences,
    {
      valueEncoding: "json",
    }
  );

  if (!userPreferences?.friendRequestNotificationsEnabled) return;

  new Notification({
    title: t("new_friend_request_title", {
      ns: "notifications",
    }),
    body: t("new_friend_request_description", {
      ns: "notifications",
      displayName: user.displayName,
    }),
    icon: user?.profileImageUrl
      ? await downloadImage(user.profileImageUrl)
      : trayIcon,
  }).show();
};

export const publishFriendStartedPlayingGameNotification = async (
  friend: UserProfile
) => {
  new Notification({
    title: t("friend_started_playing_game", {
      ns: "notifications",
      displayName: friend.displayName,
    }),
    body: friend?.currentGame?.title,
    icon: friend?.profileImageUrl
      ? await downloadImage(friend.profileImageUrl)
      : trayIcon,
  }).show();
};

export const publishExtractionCompleteNotification = async (game: Game) => {
  const title = t("extraction_complete", { ns: "notifications" });
  const body = t("game_extracted", {
    ns: "notifications",
    title: game.title,
  });

  new Notification({
    title,
    body,
    icon: trayIcon,
  }).show();

  // Create local notification
  await LocalNotificationManager.createNotification(
    "EXTRACTION_COMPLETE",
    title,
    body,
    {
      url: `/game/${game.shop}/${game.objectId}`,
    }
  );
};

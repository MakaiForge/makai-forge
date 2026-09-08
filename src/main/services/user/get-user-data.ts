import { User, type UserDetails } from "@types";
import { db } from "@main/store";
import { storeKeys } from "@main/store/sublevels";

export const getUserData = async () => {
  try {
    const loggedUser = await db.get<string, User>(storeKeys.user, {
      valueEncoding: "json",
    });

    if (loggedUser) {
      return {
        ...loggedUser,
        username: "",
        bio: "",
        email: null,
        profileVisibility: "PUBLIC" as any,
        quirks: {
          backupsPerGameLimit: 0,
        },
        subscription: loggedUser.subscription
          ? {
              id: loggedUser.subscription.id,
              status: loggedUser.subscription.status,
              plan: {
                id: loggedUser.subscription.plan.id,
                name: loggedUser.subscription.plan.name,
              },
              expiresAt: loggedUser.subscription.expiresAt,
            }
          : null,
      } as UserDetails;
    }
  } catch {
    // No user logged in — expected
  }

  return null;
};

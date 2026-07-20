import { createContext, useCallback, useEffect, useState } from "react";

import { setUserPreferences } from "@features";
import { useAppDispatch } from "@hooks";
import { storeService } from "@shared-services/store.service";
import type { UserBlocks, UserPreferences } from "@types";
import { useSearchParams } from "react-router-dom";

export type SettingsCategoryId =
  | "general"
  | "login"
  | "account_settings"
  | "content_gameplay"
  | "runners"
  | "integrations"
  | "compatibility"
  | "account_privacy";

const legacyTabMap: Record<number, SettingsCategoryId> = {
  0: "general",
  1: "content_gameplay",
  2: "general",
  3: "general",
  4: "integrations",
  5: "account_privacy",
};

const isSettingsCategoryId = (value: string): value is SettingsCategoryId => {
  return [
    "general",
    "login",
    "account_settings",
    "content_gameplay",
    "runners",
    "integrations",
    "compatibility",
    "account_privacy",
  ].includes(value);
};

export interface SettingsContext {
  updateUserPreferences: (values: Partial<UserPreferences>) => Promise<void>;
  setCurrentCategoryId: React.Dispatch<
    React.SetStateAction<SettingsCategoryId>
  >;
  clearTheme: () => void;
  currentCategoryId: SettingsCategoryId;
  blockedUsers: UserBlocks["blocks"];
  fetchBlockedUsers: () => Promise<void>;
  appearance: {
    theme: string | null;
    authorId: string | null;
    authorName: string | null;
  };
  sourceUrl: string;
  clearSourceUrl: () => void;
}

export const settingsContext = createContext<SettingsContext>({
  updateUserPreferences: async () => {},
  setCurrentCategoryId: () => {},
  clearTheme: () => {},
  currentCategoryId: "general",
  blockedUsers: [],
  fetchBlockedUsers: async () => {},
  appearance: {
    theme: null,
    authorId: null,
    authorName: null,
  },
  sourceUrl: "",
  clearSourceUrl: () => {},
});

const { Provider } = settingsContext;
export const { Consumer: SettingsContextConsumer } = settingsContext;

export interface SettingsContextProviderProps {
  children: React.ReactNode;
}

export function SettingsContextProvider({
  children,
}: Readonly<SettingsContextProviderProps>) {
  const dispatch = useAppDispatch();
  const [appearance, setAppearance] = useState<{
    theme: string | null;
    authorId: string | null;
    authorName: string | null;
  }>({
    theme: null,
    authorId: null,
    authorName: null,
  });
  const [currentCategoryId, setCurrentCategoryId] =
    useState<SettingsCategoryId>("general");
  const [blockedUsers, setBlockedUsers] = useState<UserBlocks["blocks"]>([]);
  const [sourceUrl, setSourceUrl] = useState("");

  const clearSourceUrl = useCallback(() => setSourceUrl(""), []);

  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab");
  const defaultAppearanceTheme = searchParams.get("theme");
  const defaultAppearanceAuthorId = searchParams.get("authorId");
  const defaultAppearanceAuthorName = searchParams.get("authorName");

  useEffect(() => {
    if (defaultTab) {
      if (isSettingsCategoryId(defaultTab)) {
        setCurrentCategoryId(defaultTab);
        return;
      }

      const idx = Number(defaultTab);
      if (!Number.isNaN(idx) && legacyTabMap[idx]) {
        setCurrentCategoryId(legacyTabMap[idx]);
      }
    }
  }, [defaultTab]);

  useEffect(() => {
    if (appearance.theme) setCurrentCategoryId("general");
  }, [appearance.theme]);

  useEffect(() => {
    if (
      defaultAppearanceTheme &&
      defaultAppearanceAuthorId &&
      defaultAppearanceAuthorName
    ) {
      setAppearance({
        theme: defaultAppearanceTheme,
        authorId: defaultAppearanceAuthorId,
        authorName: defaultAppearanceAuthorName,
      });
    }
  }, [
    defaultAppearanceTheme,
    defaultAppearanceAuthorId,
    defaultAppearanceAuthorName,
  ]);

  const clearTheme = useCallback(() => {
    setAppearance({
      theme: null,
      authorId: null,
      authorName: null,
    });
  }, []);

  const fetchBlockedUsers = useCallback(async () => {
    const blockedUsers = await window.electron.forgerApi
      .get<UserBlocks>("/profile/blocks", {
        params: { take: 12, skip: 0 },
      })
      .catch(() => {
        return { blocks: [] };
      });
    setBlockedUsers(blockedUsers.blocks);
  }, []);

  useEffect(() => {
    fetchBlockedUsers();
  }, [fetchBlockedUsers]);

  const updateUserPreferences = async (values: Partial<UserPreferences>) => {
    await window.electron.updateUserPreferences(values);
    storeService
      .get("userPreferences", null, "json")
      .then((userPreferences) => {
        dispatch(setUserPreferences(userPreferences as UserPreferences | null));
      });
  };

  return (
    <Provider
      value={{
        updateUserPreferences,
        setCurrentCategoryId,
        fetchBlockedUsers,
        clearTheme,
        currentCategoryId,
        blockedUsers,
        appearance,
        sourceUrl,
        clearSourceUrl,
      }}
    >
      {children}
    </Provider>
  );
}

import type { ScreenState } from "@types";
import { db, storeKeys } from "@main/store";

export async function saveScreenConfig(configScreenWhenClosed: ScreenState) {
  await db.put(storeKeys.screenState, configScreenWhenClosed, {
    valueEncoding: "json",
  });
}

export async function loadScreenConfig(): Promise<ScreenState> {
  try {
    const data = await db.get<string, ScreenState>(
      storeKeys.screenState,
      { valueEncoding: "json" }
    );
    return data ?? { isMaximized: false, height: 860, width: 1200 };
  } catch {
    return { isMaximized: false, height: 860, width: 1200 };
  }
}

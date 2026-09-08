import { db } from "@main/store";
import { storeKeys } from "@main/store/sublevels";

export interface ProtonApiOptions {
  needsAuth?: boolean;
  needsSubscription?: boolean;
  ifModifiedSince?: Date;
}

export class ProtonApi {
  public static isLoggedIn() {
    return false;
  }

  public static hasActiveSubscription() {
    return false;
  }

  static async setupApi() {
    await db.getMany<string>([storeKeys.auth, storeKeys.user], {
      valueEncoding: "json",
    });
  }

  static handleExternalAuth(_uri: string) {}

  static handleSignOut() {}

  static async refreshToken() {
    return { accessToken: "" };
  }

  static async checkDownloadSourcesChanges(
    _downloadSourceIds: string[],
    _games: Array<{ shop: string; objectId: string }>,
    _since: string
  ) {
    return [];
  }

  static async get<T = any>(_url?: string, _params?: any, _options?: ProtonApiOptions): Promise<T | null> {
    return null;
  }

  static async post<T = any>(_url?: string, _data?: any, _options?: ProtonApiOptions): Promise<T | null> {
    return null;
  }

  static async put<T = any>(_url?: string, _data?: any, _options?: ProtonApiOptions): Promise<T | null> {
    return null;
  }

  static async patch<T = any>(_url?: string, _data?: any, _options?: ProtonApiOptions): Promise<T | null> {
    return null;
  }

  static async delete<T = any>(_url?: string, _options?: ProtonApiOptions): Promise<T | null> {
    return null;
  }
}

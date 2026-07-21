import { ProtonForgeApi } from "@main/services/protonforge-api";

export class ProtonForgeDebridClient {
  public static async getAvailableMagnets(
    magnets: string[]
  ): Promise<Record<string, boolean> | null> {
    return ProtonForgeApi.put<Record<string, boolean>>(
      "/debrid/check-availability",
      {
        magnets,
      },
      { needsAuth: false }
    );
  }

  public static async getDownloadUrl(magnet: string) {
    try {
      const response = await ProtonForgeApi.post<{ downloadUrl: string }>("/debrid/request-file", {
        magnet,
      });

      return response?.downloadUrl ?? null;
    } catch (error) {
      return null;
    }
  }
}

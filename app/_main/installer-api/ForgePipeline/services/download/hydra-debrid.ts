import { ProtonApi } from "@main/services/forger-api";

export class HydraDebridClient {
  public static async getAvailableMagnets(
    magnets: string[]
  ): Promise<Record<string, boolean> | null> {
    return ProtonApi.put<Record<string, boolean>>(
      "/debrid/check-availability",
      {
        magnets,
      },
      { needsAuth: false }
    );
  }

  public static async getDownloadUrl(magnet: string) {
    try {
      const response = await ProtonApi.post<{ downloadUrl: string }>("/debrid/request-file", {
        magnet,
      });

      return response?.downloadUrl ?? null;
    } catch (error) {
      return null;
    }
  }
}

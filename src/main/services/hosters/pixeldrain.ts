import axios from "axios";
import { logger } from "@main/services";

export class PixelDrainApi {
  private static readonly BYPASS_BASE_URL = "https://cdn.pixeldrain.eu.cc";
  private static readonly BYPASS_TIMEOUT_MS = 5000;

  public static canHandle(url: string): boolean {
    try {
      return new URL(url).hostname.includes("pixeldrain.com");
    } catch {
      return false;
    }
  }

  private static extractId(url: string): string {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid pixeldrain URL: ${url}`);
    }

    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    const id = pathParts[1];

    // Aceita /u/<id> (arquivo) e /l/<id> (lista) — alguns catálogos usam listas
    if ((pathParts[0] !== "u" && pathParts[0] !== "l") || !id) {
      throw new Error(`Invalid pixeldrain URL: ${url}`);
    }

    return id;
  }

  private static extractItemIndex(url: string): number {
    try {
      // URLs de lista podem indicar o item: https://pixeldrain.com/l/<id>#item=0
      const hash = new URL(url).hash;
      const match = hash.match(/item=(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    } catch {
      return 0;
    }
  }

  private static async resolveList(id: string, itemIndex: number): Promise<string> {
    const response = await axios.get(`https://pixeldrain.com/api/list/${id}`, {
      validateStatus: () => true,
    });

    if (response.status === 404) {
      throw new Error("List not found");
    }

    const files = response.data?.files as Array<{ id: string; name?: string }> | undefined;
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("List is empty");
    }

    const file = files[itemIndex] ?? files[0];
    logger.log(
      `[PixelDrain] List ${id} item ${itemIndex} -> ${file?.name ?? file?.id}`
    );
    return `https://pixeldrain.com/api/file/${file.id}?download`;
  }

  private static async checkAvailability(id: string): Promise<void> {
    const response = await axios.head(`https://pixeldrain.com/u/${id}`, {
      validateStatus: () => true,
    });

    if (response.status === 404) {
      throw new Error("File not found");
    }
  }

  private static getBypassUrl(id: string): string {
    return `${this.BYPASS_BASE_URL}/${id}`;
  }

  private static async tryBypass(id: string): Promise<string | null> {
    const bypassUrl = this.getBypassUrl(id);

    try {
      const response = await axios.head(bypassUrl, {
        timeout: this.BYPASS_TIMEOUT_MS,
        validateStatus: () => true,
      });

      if (response.status >= 200 && response.status < 400) {
        return bypassUrl;
      }

      logger.log(
        `[PixelDrain] Bypass HEAD returned status ${response.status}, falling back to API resolver.`
      );
      return null;
    } catch {
      logger.log(
        `[PixelDrain] Bypass HEAD failed, falling back to API resolver.`
      );
      return null;
    }
  }

  public static async unlock(url: string): Promise<string> {
    try {
      const parsed = new URL(url);
      const isList = parsed.pathname.split("/").filter(Boolean)[0] === "l";

      const id = this.extractId(url);

      if (isList) {
        // Link de lista: resolve o arquivo indicado (#item=N, default 0)
        return this.resolveList(id, this.extractItemIndex(url));
      }

      const bypassUrl = await this.tryBypass(id);

      if (bypassUrl) {
        return bypassUrl;
      }

      await this.checkAvailability(id);
      return `https://pixeldrain.com/api/file/${id}?download`;
    } catch (error) {
      logger.error("Error fetching PixelDrain URL:", error);
      throw error;
    }
  }

  public static async getDownloadUrl(url: string): Promise<string> {
    return this.unlock(url);
  }
}

import axios from "axios";
import { logger } from "../logger";

interface UnlockResponse {
  link: string;
  hoster: string;
}

function isNimbusConfigured(): boolean {
  const url = import.meta.env.MAIN_VITE_NIMBUS_API_URL as string | undefined;
  if (!url) return false;
  try {
    const parsed = new URL(url);
    // "http://localhost:0" (porta 0) é placeholder inválido — nunca funciona
    if (parsed.port === "0" || parsed.port === "") return false;
    return true;
  } catch {
    return false;
  }
}

export class VikingFileApi {
  public static async getDownloadUrl(uri: string): Promise<string> {
    // O link /f/<id> do VikingFile é um download direto (302 -> mirror).
    // O unlock via Nimbus é só aceleração (debrid); se a API não estiver
    // configurada ou falhar, baixa direto mesmo.
    if (isNimbusConfigured()) {
      try {
        const unlockResponse = await axios.post<UnlockResponse>(
          `${import.meta.env.MAIN_VITE_NIMBUS_API_URL}/hosters/unlock`,
          { url: uri }
        );

        if (!unlockResponse.data.link) {
          throw new Error("Failed to unlock VikingFile URL");
        }

        const redirectUrl = unlockResponse.data.link;

        try {
          const redirectResponse = await axios.head(redirectUrl, {
            maxRedirects: 0,
            validateStatus: (status) =>
              status === 301 || status === 302 || status === 200,
          });

          if (
            redirectResponse.headers.location ||
            redirectResponse.status === 301 ||
            redirectResponse.status === 302
          ) {
            return redirectResponse.headers.location || redirectUrl;
          }

          return redirectUrl;
        } catch (error) {
          logger.error(
            `[VikingFile] Error following redirect, using redirect URL:`,
            error
          );
          return redirectUrl;
        }
      } catch (error) {
        logger.warn(
          `[VikingFile] Nimbus unlock failed (${(error as Error)?.message}), falling back to direct download`
        );
      }
    } else {
      logger.warn(
        "[VikingFile] Nimbus API not configured, using direct download"
      );
    }

    // Fallback: o link /f/<id> é um download direto (com redirect para o mirror)
    return uri.trim();
  }
}

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { app, net } from "electron";
import { logger } from "./logger";
import { gamesStore, gamesShopAssetsStore } from "@main/store";

const CONCURRENCY = 4;
const TIMEOUT_MS = 20_000;

/** Campos de imagem que o app usa nas telas (biblioteca/Downloads/detalhes). */
const IMAGE_FIELDS = [
  "iconUrl",
  "libraryImageUrl",
  "libraryHeroImageUrl",
  "logoImageUrl",
  "coverImageUrl",
  "customIconUrl",
  "customLogoImageUrl",
  "customHeroImageUrl",
] as const;

let cacheDir: string | null = null;

function getCacheDir(): string {
  if (!cacheDir) {
    cacheDir = path.join(app.getPath("userData"), "image-cache");
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

const mimeToExt: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
  "image/x-icon": ".ico",
};

const MIME_EXTS = Object.values(mimeToExt);

function extFromUrl(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    return ext && ext.length <= 6 ? ext : ".img";
  } catch {
    return ".img";
  }
}

function hashFor(url: string): string {
  return crypto.createHash("sha1").update(url).digest("hex");
}

function cachePathFor(url: string, ext?: string): string {
  return path.join(getCacheDir(), `${hashFor(url)}${ext ?? extFromUrl(url)}`);
}

function toLocalUrl(filePath: string): string {
  // O protocolo `local://` (protocols.ts) converte o caminho de volta para file://
  return `local://${filePath}`;
}

function isRemoteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

const inflight = new Map<string, Promise<string | null>>();

/**
 * Baixa a imagem para o cache local (idempotente — chamadas simultâneas
 * compartilham o mesmo download). Retorna a URL `local://` do arquivo.
 */
export function downloadToCache(url: string): Promise<string | null> {
  if (!isRemoteUrl(url)) return Promise.resolve(null);

  const existing = inflight.get(url);
  if (existing) return existing;

  const promise = (async (): Promise<string | null> => {
    const urlExt = extFromUrl(url);
    const urlExtPath = cachePathFor(url, urlExt);
    if (fs.existsSync(urlExtPath)) return toLocalUrl(urlExtPath);

    let finalPath: string | null = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let response: Response;
      try {
        response = await net.fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) return null;

      const contentType = (response.headers.get("content-type") ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      const ext = mimeToExt[contentType] ?? urlExt;
      finalPath = cachePathFor(url, ext);
      if (fs.existsSync(finalPath)) return toLocalUrl(finalPath);

      const buffer = Buffer.from(await response.arrayBuffer());
      // Evita arquivo parcial em caso de falha no meio da escrita
      const tmpPath = `${finalPath}.tmp`;
      try {
        fs.writeFileSync(tmpPath, buffer);
        fs.renameSync(tmpPath, finalPath);
      } catch (writeErr: any) {
        try {
          fs.rmSync(tmpPath, { force: true });
        } catch {}
        throw writeErr;
      }

      return toLocalUrl(finalPath);
    } catch (err: any) {
      if (finalPath && fs.existsSync(finalPath)) return toLocalUrl(finalPath);
      logger.warn(
        `[ImageCache] download failed: ${url} — ${err?.message ?? err}`
      );
      return null;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, promise);
  return promise;
}

/** Consulta síncrona: retorna a URL local se a imagem já estiver em cache. */
function peekCache(url: string): string | null {
  const urlExt = extFromUrl(url);
  const urlExtPath = cachePathFor(url, urlExt);
  if (fs.existsSync(urlExtPath)) return toLocalUrl(urlExtPath);

  // A extensão gravada pode diferir da do URL (mime venceu no download)
  for (const ext of MIME_EXTS) {
    const p = cachePathFor(url, ext);
    if (fs.existsSync(p)) return toLocalUrl(p);
  }
  return null;
}

/**
 * Resolve a URL de uma imagem:
 * - cache local presente → devolve `local://` (instantâneo e offline);
 * - cache ausente → devolve a URL remota e inicia o download em segundo plano
 *   (o próximo fetch da biblioteca já usa o arquivo local).
 * URLs que não são http(s) (data:, local:, caminhos relativos) passam intactas.
 */
export async function resolveImageUrl(
  url: string | null | undefined
): Promise<string | null> {
  if (!url) return null;
  if (!isRemoteUrl(url)) return url;

  // Não bloqueia o carregamento da biblioteca aguardando download
  const cached = peekCache(url);
  if (cached) return cached;

  void downloadToCache(url);
  return url;
}

/** Aplica resolveImageUrl a todos os campos de imagem de um objeto de jogo. */
export async function resolveGameImages<T extends Record<string, unknown>>(
  game: T
): Promise<T> {
  const result = { ...game } as Record<string, unknown>;
  await Promise.all(
    IMAGE_FIELDS.map(async (field) => {
      const value = result[field];
      if (typeof value === "string") {
        result[field] = await resolveImageUrl(value);
      }
    })
  );
  return result as T;
}

function collectUrls(obj: Record<string, unknown>, into: Set<string>): void {
  for (const field of IMAGE_FIELDS) {
    const value = obj[field];
    if (typeof value === "string" && isRemoteUrl(value)) into.add(value);
  }
}

/** Reúne todas as URLs de imagem dos jogos da biblioteca (games + assets). */
export async function collectLibraryImageUrls(): Promise<string[]> {
  const urls = new Set<string>();
  try {
    const entries = await gamesStore.iterator().all();
    for (const [key, game] of entries) {
      collectUrls(game as Record<string, unknown>, urls);
      try {
        const assets = await gamesShopAssetsStore.get(key);
        collectUrls(assets as Record<string, unknown>, urls);
      } catch {
        // Sem assets persistidos — segue
      }
    }
  } catch (err: any) {
    logger.warn(`[ImageCache] collectLibraryImageUrls: ${err?.message ?? err}`);
  }
  return [...urls];
}

/**
 * Baixa as imagens da biblioteca em segundo plano (com limite de concorrência).
 * Retorna quantas imagens foram efetivamente baixadas neste ciclo.
 */
export async function prewarmLibraryImages(): Promise<number> {
  const urls = await collectLibraryImageUrls().catch(() => [] as string[]);
  if (urls.length === 0) return 0;

  let downloaded = 0;
  let index = 0;
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, urls.length) },
    async () => {
      while (index < urls.length) {
        const url = urls[index++];
        const cached = await downloadToCache(url).catch(() => null);
        if (cached) downloaded++;
      }
    }
  );
  await Promise.all(workers);

  if (downloaded > 0) {
    logger.info(`[ImageCache] Pré-aquecido: ${downloaded}/${urls.length} imagens`);
  }
  return downloaded;
}

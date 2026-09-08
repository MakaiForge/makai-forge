import { registerEvent } from "../register-event";
import { handleGetGameDownloadSources } from "@main/services/local-sources-handler";
import { getGameDetails, getFeaturedGames } from "./helpers/steam-local";
import { MakaiApi } from "@main/services/makai-api";
import { getGameAssets } from "../catalogue/get-game-assets";
import {
  localSearchGames,
  localSearchSuggestions,
  localGetGame,
} from "@main/services/local-catalog";
import { resolveGameImages } from "@main/services/image-cache";

interface ProtonApiCallPayload {
  method: "get" | "post" | "put" | "patch" | "delete";
  url: string;
  data?: unknown;
  params?: unknown;
  options?: {
    needsAuth?: boolean;
    needsSubscription?: boolean;
    ifModifiedSince?: Date;
  };
}

const LOCAL_ROUTES: Array<{
  pattern: RegExp;
  handler: (
    method: string,
    match: RegExpMatchArray,
    params: any,
    data: any
  ) => any;
}> = [
  {
    pattern: /^\/games\/(\w+)\/([^/]+)\/download-sources$/,
    handler: async (_method, match, params) => {
      const [, shop, objectId] = match;
      const title = params?.title || "";

      let gameTitle = title;
      let embeddedDownloads;

      // Fonte primária: catálogo local (mesma lógica do ProtonForger antigo)
      const localGame = await localGetGame(objectId);
      if (localGame?.downloads?.length > 0) {
        embeddedDownloads = localGame.downloads;
      }

      if (!gameTitle && localGame?.title) {
        gameTitle = localGame.title;
      }

      // Enriquecimento opcional via API remota (se disponível)
      if (!embeddedDownloads) {
        const apiGame = await MakaiApi.getGame(objectId).catch(() => null);
        if (apiGame && apiGame.downloads && apiGame.downloads.length > 0) {
          embeddedDownloads = apiGame.downloads;
        }
        if (!gameTitle && apiGame?.title) {
          gameTitle = apiGame.title;
        }
      }

      if (!gameTitle && /^\d+$/.test(objectId)) {
        try {
          const steamTitle = await getGameDetails(objectId).then(
            (d: any) => d?.title
          );
          if (steamTitle) gameTitle = steamTitle;
        } catch {}
      }

      return handleGetGameDownloadSources(shop, objectId, gameTitle, embeddedDownloads);
    },
  },
  {
    pattern: /^\/auth\//,
    handler: (_method) => {
      if (_method === "POST") return { success: true };
      return { id: null, username: null, email: null };
    },
  },
  {
    pattern: /^\/profile\//,
    handler: (method) => (method === "GET" ? [] : { success: true }),
  },
  {
    pattern: /^\/users\//,
    handler: () => ({ id: null, username: "local-user" }),
  },
  {
    pattern: /^\/debrid\//,
    handler: () => ({ services: [] }),
  },
  {
    pattern: /^\/catalogue\/search\/suggestions/,
    handler: async (_method, _match, params) => {
      const title = (params as any)?.title || "";
      if (!title) return [];
      const result = await localSearchSuggestions(title);
      return result || [];
    },
  },
  {
    pattern: /^\/games\/\w+\/[^/]+\/protondb$/,
    handler: () => null,
  },
  {
    pattern: /^\/games\/custom\/.*\/assets$/,
    handler: async (_method, match) => {
      const [, , objectId] = (match[0] || "").match(/\/games\/custom\/([^/]+)\/assets/) || [];
      if (!objectId) return null;
      return getGameAssets(objectId, "custom");
    },
  },
  {
    pattern: /^\/features$/,
    handler: () => [],
  },
  {
    pattern: /^\/catalogue\/search$/,
    handler: async (_method, _match, _params, data) => {
      const { take = 20, skip = 0, genres, showAdult, ...filters } = (data || {}) as any;
      if (genres?.length) filters.genre = genres;
      if (showAdult) filters.showAdult = true;
      const result = await localSearchGames(filters, take, skip);
      if (!result?.edges?.length) return result || { edges: [], count: 0 };
      // Miniaturas passam pelo cache local (local://) — instantâneas e offline
      return {
        ...result,
        edges: await Promise.all(
          result.edges.map((edge: any) => resolveGameImages(edge))
        ),
      };
    },
  },
  {
    pattern: /^\/catalogue\/(hot|featured)$/,
    handler: async () => {
      try {
        return await getFeaturedGames();
      } catch {
        return [];
      }
    },
  },
];

const forgerApiCall = async (
  _event: Electron.IpcMainInvokeEvent,
  payload: ProtonApiCallPayload
) => {
  const { method, url, data, params } = payload;

  for (const route of LOCAL_ROUTES) {
    const match = url.match(route.pattern);
    if (match) {
      return route.handler(method, match, params, data);
    }
  }

  return null;
};

registerEvent("forgerApiCall", forgerApiCall);

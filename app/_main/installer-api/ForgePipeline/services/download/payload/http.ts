import type { Download } from "@types";
import {
  GofileApi,
  DatanodesApi,
  MediafireApi,
  PixelDrainApi,
  VikingFileApi,
  RootzApi,
  BuzzheavierApi,
  FuckingFastApi,
} from "@main/services/hosters";
import { ProtonDebridClient } from "../proton-debrid";
import { Downloader, DownloadError } from "@shared";
import { parseGofileUri, createDownloadPayload } from "../url";
import { logger } from "@main/services/logger";

interface LibtorrentActionPayload {
  action: "start";
  game_id: string;
  url?: string;
  save_path?: string;
  out?: string;
  header?: string;
  allow_multiple_connections?: boolean;
  connections_limit?: number;
  file_indices?: number[];
  metadata_timeout_ms?: number;
}

export async function getHttpPayload(
  download: Download,
  downloadId: string
): Promise<LibtorrentActionPayload | undefined> {
  switch (download.downloader) {
    case Downloader.Gofile: {
      const { id, password } = parseGofileUri(download.uri);
      if (!id) throw new Error("Invalid gofile URL");

      const downloadLink = await GofileApi.getDownloadLink(id, password);
      await GofileApi.checkDownloadUrl(downloadLink);
      const token = await GofileApi.authorize();

      return {
        action: "start",
        game_id: downloadId,
        url: downloadLink,
        save_path: download.downloadPath,
        header: `Cookie: accountToken=${token}`,
        allow_multiple_connections: true,
        connections_limit: 8,
      };
    }
    case Downloader.PixelDrain: {
      const downloadUrl = await PixelDrainApi.unlock(download.uri);
      return {
        action: "start",
        game_id: downloadId,
        url: downloadUrl,
        save_path: download.downloadPath,
      };
    }
    case Downloader.Datanodes: {
      const downloadUrl = await DatanodesApi.getDownloadUrl(download.uri);
      return {
        action: "start",
        game_id: downloadId,
        url: downloadUrl,
        save_path: download.downloadPath,
      };
    }
    case Downloader.Buzzheavier: {
      logger.log(
        `[DownloadManager] Processing Buzzheavier download for URI: ${download.uri}`
      );
      const directUrl = await BuzzheavierApi.getDirectLink(download.uri);
      return createDownloadPayload(
        directUrl,
        download.uri,
        downloadId,
        download.downloadPath
      );
    }
    case Downloader.FuckingFast: {
      logger.log(
        `[DownloadManager] Processing FuckingFast download for URI: ${download.uri}`
      );
      const directUrl = await FuckingFastApi.getDirectLink(download.uri);
      return createDownloadPayload(
        directUrl,
        download.uri,
        downloadId,
        download.downloadPath
      );
    }
    case Downloader.Mediafire: {
      const downloadUrl = await MediafireApi.getDownloadUrl(download.uri);
      return {
        action: "start",
        game_id: downloadId,
        url: downloadUrl,
        save_path: download.downloadPath,
      };
    }
    case Downloader.Nimbus: {
      const downloadUrl = await ProtonDebridClient.getDownloadUrl(download.uri);
      if (!downloadUrl) throw new Error(DownloadError.NotCached);
      return {
        action: "start",
        game_id: downloadId,
        url: downloadUrl,
        save_path: download.downloadPath,
        allow_multiple_connections: true,
      };
    }
    case Downloader.VikingFile: {
      logger.log(
        `[DownloadManager] Processing VikingFile download for URI: ${download.uri}`
      );
      const downloadUrl = await VikingFileApi.getDownloadUrl(download.uri);
      return createDownloadPayload(
        downloadUrl,
        download.uri,
        downloadId,
        download.downloadPath
      );
    }
    case Downloader.Rootz: {
      const downloadUrl = await RootzApi.getDownloadUrl(download.uri);
      return {
        action: "start",
        game_id: downloadId,
        url: downloadUrl,
        save_path: download.downloadPath,
      };
    }
    default:
      return undefined;
  }
}

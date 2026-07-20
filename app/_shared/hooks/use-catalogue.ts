import { useCallback, useEffect, useState } from "react";
import { storeService } from "@renderer/services/store.service";
import type { DownloadSource } from "@types";
import { useAppDispatch } from "./redux";
import { setGenres, setTags } from "@renderer/features";

export function useCatalogue() {
  const dispatch = useAppDispatch();

  const [steamPublishers, setSteamPublishers] = useState<string[]>([]);
  const [steamDevelopers, setSteamDevelopers] = useState<string[]>([]);
  const [downloadSources, setDownloadSources] = useState<DownloadSource[]>([]);

  const getSteamUserTags = useCallback(() => {
    window.electron.getLocalResource("steam-user-tags.json").then((data) => {
      if (data) dispatch(setTags(data as Record<string, Record<string, number>>));
    });
  }, [dispatch]);

  const getSteamGenres = useCallback(() => {
    window.electron.getLocalResource("steam-genres.json").then((data) => {
      if (data) dispatch(setGenres(data as Record<string, string[]>));
    });
  }, [dispatch]);

  const getSteamPublishers = useCallback(() => {
    window.electron.getLocalResource("steam-publishers.json").then((data) => {
      if (data) setSteamPublishers(data as string[]);
    });
  }, []);

  const getSteamDevelopers = useCallback(() => {
    window.electron.getLocalResource("steam-developers.json").then((data) => {
      if (data) setSteamDevelopers(data as string[]);
    });
  }, []);

  const getDownloadSources = useCallback(() => {
    storeService.values("downloadSources").then((results) => {
      const sources = results as DownloadSource[];
      setDownloadSources(sources.filter((source) => !!source.fingerprint));
    });
  }, []);

  useEffect(() => {
    getSteamUserTags();
    getSteamGenres();
    getSteamPublishers();
    getSteamDevelopers();
    getDownloadSources();
  }, [
    getSteamUserTags,
    getSteamGenres,
    getSteamPublishers,
    getSteamDevelopers,
    getDownloadSources,
  ]);

  return { steamPublishers, downloadSources, steamDevelopers };
}

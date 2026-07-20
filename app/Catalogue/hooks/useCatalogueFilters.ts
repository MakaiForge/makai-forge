import { useAppSelector } from "@renderer/hooks";
import { useCatalogue } from "@renderer/hooks/use-catalogue";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  CURATED_GENRES,
  filterCategoryColors,
  type FilterSectionData,
  type GroupedFilter,
} from "../types";

function decodeHTML(s: string) {
  return s.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}

export function useCatalogueFilters() {
  const { t, i18n } = useTranslation("catalogue");
  const { steamDevelopers, steamPublishers, downloadSources } = useCatalogue();
  const { steamGenres, steamUserTags, filters } = useAppSelector(
    (state) => state.catalogueSearch
  );

  const language = i18n.language.split("-")[0];

  const steamGenresMapping = useMemo<Record<string, string>>(() => {
    if (!steamGenres[language]) return {};

    return steamGenres[language].reduce((prev, genre, index) => {
      prev[genre] = steamGenres["en"][index];
      return prev;
    }, {} as Record<string, string>);
  }, [steamGenres, language]);

  const steamGenresFilterItems = useMemo(() => {
    return CURATED_GENRES.map((genre) => {
      const entry = Object.entries(steamGenresMapping).find(
        ([, english]) => english === genre
      );
      return {
        label: entry ? entry[0] : genre,
        value: genre,
        checked: filters.genres.includes(genre),
      };
    });
  }, [steamGenresMapping, filters.genres]);

  const steamUserTagsFilterItems = useMemo(() => {
    if (!steamUserTags[language]) return [];

    return Object.entries(steamUserTags[language])
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => ({
        label: key,
        value: value,
        checked: filters.tags.includes(value),
      }));
  }, [steamUserTags, filters.tags, language]);

  const groupedFilters: GroupedFilter[] = useMemo(() => {
    return [
      ...filters.genres.map((genre) => ({
        label: Object.keys(steamGenresMapping).find(
          (key) => steamGenresMapping[key] === genre
        ) as string,
        filterType: t("genres"),
        orbColor: filterCategoryColors.genres,
        key: "genres" as const,
        value: genre,
      })),

      ...filters.tags.map((tag) => ({
        label: Object.keys(steamUserTags[language]).find(
          (key) => steamUserTags[language][key] === tag
        ),
        filterType: t("tags"),
        orbColor: filterCategoryColors.tags,
        key: "tags" as const,
        value: String(tag),
      })),

      ...filters.downloadSourceFingerprints.map((fingerprint) => ({
        label: downloadSources.find(
          (source) => source.fingerprint === fingerprint
        )?.name as string,
        filterType: t("download_sources"),
        orbColor: filterCategoryColors.downloadSourceFingerprints,
        key: "downloadSourceFingerprints" as const,
        value: fingerprint,
      })),

      ...filters.developers.map((developer) => ({
        label: developer,
        filterType: t("developers"),
        orbColor: filterCategoryColors.developers,
        key: "developers" as const,
        value: developer,
      })),

      ...filters.publishers.map((publisher) => ({
        label: decodeHTML(publisher),
        filterType: t("publishers"),
        orbColor: filterCategoryColors.publishers,
        key: "publishers" as const,
        value: publisher,
      })),
    ];
  }, [
    filters,
    steamUserTags,
    downloadSources,
    steamGenresMapping,
    language,
    t,
  ]);

  const filterSections: FilterSectionData[] = useMemo(() => {
    return [
      {
        title: t("genres"),
        items: steamGenresFilterItems,
        key: "genres",
      },
      {
        title: t("tags"),
        items: steamUserTagsFilterItems,
        key: "tags",
      },
      {
        title: t("download_sources"),
        items: downloadSources
          .filter((source) => source.fingerprint)
          .map((source) => ({
            label: source.name,
            value: source.fingerprint!,
            checked: filters.downloadSourceFingerprints.includes(
              source.fingerprint!
            ),
          })),
        key: "downloadSourceFingerprints",
      },
      {
        title: t("developers"),
        items: steamDevelopers.map((developer) => ({
          label: developer,
          value: developer,
          checked: filters.developers.includes(developer),
        })),
        key: "developers",
      },
      {
        title: t("publishers"),
        items: steamPublishers.map((publisher) => ({
          label: decodeHTML(publisher),
          value: publisher,
          checked: filters.publishers.includes(publisher),
        })),
        key: "publishers",
      },
    ];
  }, [
    downloadSources,
    filters.developers,
    filters.downloadSourceFingerprints,
    filters.publishers,
    steamDevelopers,
    steamGenresFilterItems,
    steamPublishers,
    steamUserTagsFilterItems,
    t,
  ]);

  const selectedFiltersCount = groupedFilters.length;

  return {
    groupedFilters,
    filterSections,
    selectedFiltersCount,
  };
}

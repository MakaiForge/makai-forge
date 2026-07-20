import { useTranslation } from "react-i18next";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import { useAppDispatch, useAppSelector, useFormat } from "@renderer/hooks";
import { setFilters, setPage } from "@renderer/features";
import { Button } from "@renderer/components/button/button";
import { TextField } from "@renderer/components/text-field/text-field";

import { useCatalogueSearch } from "./hooks/useCatalogueSearch";
import { useCatalogueFilters } from "./hooks/useCatalogueFilters";
import { clearAllCategoryFilters, filterCategoryColors, PAGE_SIZE } from "./types";

import { FilterItem } from "./components/filter-item/filter-item";
import { FilterSection } from "./components/filter-section/filter-section";
import { GameItem } from "./components/game-item/game-item";
import { Pagination } from "./components/pagination/pagination";

import "./css/catalogue.scss";

export default function Catalogue() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation("catalogue");
  const { formatNumber } = useFormat();

  const { filters, page } = useAppSelector((state) => state.catalogueSearch);

  const { isLoading, isFetching, results, itemsCount, cataloguePageRef } =
    useCatalogueSearch();

  const { groupedFilters, filterSections, selectedFiltersCount } =
    useCatalogueFilters();

  return (
    <div className="catalogue" ref={cataloguePageRef}>
      <div className="catalogue__header">
        <div className="catalogue__filters-wrapper">
          <ul className="catalogue__filters-list">
            {groupedFilters.map((filter) => (
              <li key={`${filter.key}-${filter.value}`}>
                <FilterItem
                  filter={filter.label ?? ""}
                  filterType={filter.filterType}
                  orbColor={filter.orbColor}
                  onRemove={() => {
                    dispatch(
                      setFilters({
                        [filter.key]: filters[filter.key].filter(
                          (item) => item !== filter.value
                        ),
                      })
                    );
                  }}
                />
              </li>
            ))}
          </ul>
        </div>

        {selectedFiltersCount > 0 && (
          <Button
            type="button"
            theme="outline"
            className="catalogue__clear-all-button"
            onClick={() => dispatch(setFilters(clearAllCategoryFilters))}
          >
            {t("clear_filters", {
              filterCount: formatNumber(selectedFiltersCount),
            })}
          </Button>
        )}
      </div>

      <div className="catalogue__content">
        <div className="catalogue__games-container">
          {isLoading ? (
            <SkeletonTheme baseColor="#1c1c1c" highlightColor="#444">
              {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <Skeleton key={i} className="catalogue__skeleton" />
              ))}
            </SkeletonTheme>
          ) : (
            results.map((game) => <GameItem key={game.id} game={game} />)
          )}

          {isFetching && !isLoading && (
            <span className="catalogue__result-count">{t("loading")}</span>
          )}

          <div className="catalogue__pagination-container">
            <span className="catalogue__result-count">
              {t("result_count", {
                resultCount: formatNumber(itemsCount),
              })}
            </span>

            <Pagination
              page={page}
              totalPages={Math.ceil(itemsCount / PAGE_SIZE)}
              onPageChange={(page) => {
                dispatch(setPage(page));
                if (cataloguePageRef.current) {
                  cataloguePageRef.current.scrollTop = 0;
                }
              }}
            />
          </div>
        </div>

        <div className="catalogue__filters-container">
          <div className="catalogue__filters-sections">
            <TextField
              placeholder={t("search_games", { defaultValue: "Search games..." })}
              onChange={(e) => dispatch(setFilters({ title: e.target.value }))}
              value={filters.title}
              containerProps={{ className: "catalogue__search-bar" }}
              theme="dark"
            />

            {filterSections.map((section) => (
              <FilterSection
                key={section.key}
                title={section.title}
                onClear={() => dispatch(setFilters({ [section.key]: [] }))}
                color={filterCategoryColors[section.key as keyof typeof filterCategoryColors]}
                onSelect={(value) => {
                  if (
                    (filters[section.key] as (string | number)[]).includes(value)
                  ) {
                    dispatch(
                      setFilters({
                        [section.key]: (
                          filters[section.key] as (string | number)[]
                        ).filter((item) => item !== value),
                      } as any)
                    );
                  } else {
                    dispatch(
                      setFilters({
                        [section.key]: [
                          ...(filters[section.key] as (string | number)[]),
                          value,
                        ],
                      } as any)
                    );
                  }
                }}
                items={section.items}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

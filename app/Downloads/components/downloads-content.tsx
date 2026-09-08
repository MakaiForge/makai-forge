import { useTranslation } from "react-i18next";
import { ArrowDownIcon } from "@primer/octicons-react";
import type { GameShop, SeedingStatus } from "@types";
import { useDownloadsLayout } from "../hooks/useDownloadsLayout";
import { DownloadGroup } from "./download-group";

interface DownloadsContentProps {
  seedingStatus: SeedingStatus[];
  handleOpenDeleteGameModal: (shop: GameShop, objectId: string) => void;
  handleOpenGameInstaller: (shop: GameShop, objectId: string) => void;
  handleOpenRemoveGameModal: (shop: GameShop, objectId: string, title: string) => void;
}

export function DownloadsContent({
  seedingStatus,
  handleOpenDeleteGameModal,
  handleOpenGameInstaller,
  handleOpenRemoveGameModal,
}: Readonly<DownloadsContentProps>) {
  const { t } = useTranslation("downloads");
  const { libraryGroup, queuedGameIds, hasItemsInLibrary } =
    useDownloadsLayout();

  return (
    <>
      {hasItemsInLibrary ? (
        <section className="downloads__container">
          <div className="downloads__groups">
            {[
              {
                title: t("download_in_progress"),
                library: libraryGroup.downloading,
                queuedGameIds: [] as string[],
              },
              {
                title: t("queued_downloads"),
                library: libraryGroup.queued,
                queuedGameIds,
              },
              {
                title: t("downloads_completed"),
                library: libraryGroup.complete,
                queuedGameIds: [] as string[],
              },
            ].map((group) => (
              <DownloadGroup
                key={group.title}
                title={group.title}
                library={group.library}
                openDeleteGameModal={handleOpenDeleteGameModal}
                openGameInstaller={handleOpenGameInstaller}
                openRemoveGameModal={handleOpenRemoveGameModal}
                seedingStatus={seedingStatus}
                queuedGameIds={group.queuedGameIds}
              />
            ))}
          </div>
        </section>
      ) : (
        <div className="downloads__no-downloads">
          <div className="downloads__arrow-icon">
            <ArrowDownIcon size={24} />
          </div>
          <h2>{t("no_downloads_title")}</h2>
          <p>{t("no_downloads_description")}</p>
        </div>
      )}
    </>
  );
}

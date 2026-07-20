import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";

import { useEmulator } from "./hooks/use-emulator";
import { useRunnerProcess } from "./hooks/use-runner-process";
import { useExtraSites } from "./hooks/use-extra-sites";
import { PlayButton } from "./components/play-button";
import { SitePreview } from "./components/site-preview";
import { AddSiteModal } from "./components/add-site-modal";
import { ScreenshotSlideshow } from "./components/screenshot-slideshow";

import "./emulator-detail.scss";

function toSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function EmulatorDetail() {
  const { runnerId } = useParams<{ runnerId: string }>();
  const navigate = useNavigate();

  const { runner, status, icon } = useEmulator(runnerId);
  const { launching, running, handlePlay } = useRunnerProcess(runnerId);
  const { getSites, addSite, openAddModal, closeAddModal, showModal } = useExtraSites(runnerId);

  if (!runner) {
    return (
      <div className="emulator-detail">
        <div className="emulator-detail__loading">Carregando...</div>
      </div>
    );
  }

  const sites = getSites(runner.romSites);

  return (
    <div className="emulator-detail">
      <div className="emulator-detail__hero">
        <ScreenshotSlideshow platformSlug={toSlug(runner.platforms[0] || "")} />
        <div className="emulator-detail__hero-content">
          <button className="emulator-detail__back" onClick={() => navigate("/emulators")}>
            <ArrowLeft size={18} />
            <span>Voltar</span>
          </button>

          <div className="emulator-detail__header">
            {icon ? (
              <img src={icon} alt={runner.humanName} className="emulator-detail__icon" />
            ) : (
              <div className="emulator-detail__icon-placeholder">
                {runner.humanName.charAt(0)}
              </div>
            )}
            <div className="emulator-detail__info">
              <h1>{runner.humanName}</h1>
              <span className="emulator-detail__platforms">
                {runner.platforms.join(", ")}
              </span>
            </div>
            <div className="emulator-detail__actions">
              <div className="emulator-detail__version">
                v{status?.installedVersion || "?"}
              </div>
              <PlayButton
                launching={launching}
                running={running}
                onToggle={handlePlay}
              />
            </div>
          </div>

          <p className="emulator-detail__desc">{runner.description}</p>
        </div>
      </div>

      <div className="emulator-detail__sites">
        <div className="emulator-detail__sites-header">
          <h2>Sites de ROMs</h2>
          <button type="button" className="emulator-detail__add-btn" onClick={openAddModal}>
            <Plus size={16} />
            <span>Adicionar site</span>
          </button>
        </div>

        <div className="emulator-detail__sites-grid">
          {sites.map((site) => (
            <SitePreview
              key={site.url}
              name={site.name}
              url={site.url}
              imageUrl={site.imageUrl}
            />
          ))}
        </div>
      </div>

      {showModal && (
        <AddSiteModal
          onConfirm={addSite}
          onCancel={closeAddModal}
        />
      )}
    </div>
  );
}

import { Button } from "@renderer/components";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import * as api from "./services/proton-api";
import { useProtonTools } from "./hooks/useProtonTools";
import { DownloadProgress } from "./components/download-progress/download-progress";
import { ProtonInfoModal } from "./components/proton-info-modal/proton-info-modal";
import { GamesTab } from "./components/games-tab/games-tab";
import { VersionList } from "./components/version-list/version-list";
import "./css/proton-tools.scss";

interface Tool {
  id: string;
  title: string;
  description: string;
  category: string;
  endpoint?: string;
  extra?: {
    githubUrl?: string;
    author?: string;
    license?: string;
    features?: string[];
  };
}

export default function ProtonTools() {
  const { t } = useTranslation("proton_tools");
  const p = useProtonTools();
  const [tools, setTools] = useState<Tool[]>([]);

  useEffect(() => {
    api.getProtonTools().then((list: any) => {
      setTools(list as Tool[]);
    });
  }, []);

  if (p.loading) {
    return <div className="proton-tools__loading">{t("loading_versions")}</div>;
  }

  const allTools = tools.filter((t) => t.category === "proton");
  const selected = p.selectedToolId
    ? tools.find((t) => t.id === p.selectedToolId) ?? null
    : null;

  return (
    <div className="proton-tools">
      <div className="proton-tools__header">
        <h2>{t("compatibility_tools")}</h2>
        <p>{t("description")}</p>
      </div>

      <div className="proton-tools__tabs">
        <button
          className={p.activeTab === "tools" ? "active" : ""}
          onClick={() => p.setActiveTab("tools")}
        >
          {t("tools")}
        </button>
        <button
          className={p.activeTab === "downloads" ? "active" : ""}
          onClick={() => p.setActiveTab("downloads")}
        >
          {t("downloads")} {p.downloads.length > 0 && `(${p.downloads.length})`}
        </button>
        <button
          className={p.activeTab === "installed" ? "active" : ""}
          onClick={() => p.setActiveTab("installed")}
        >
          {t("installed")} ({p.installed.length})
        </button>
        <button
          className={p.activeTab === "games" ? "active" : ""}
          onClick={() => p.setActiveTab("games")}
        >
          {t("games")}
        </button>
      </div>

      {p.activeTab === "tools" && (
        <div className="proton-tools__content">
          {selected && (
            <div className="proton-tools__selected">
              <div className="proton-tools__selected-header">
                <div>
                  <h3>{selected.title}</h3>
                </div>
                <Button onClick={() => p.setSelectedToolId(null)}>✕</Button>
              </div>
              <div className="proton-tools__versions-scroll">
                {!p.releases[selected.id] ? (
                  <div className="proton-tools__loading-versions">{t("loading_versions")}</div>
                ) : p.releases[selected.id].length === 0 ? (
                  <div className="proton-tools__loading-versions">{t("no_versions")}</div>
                ) : (
                  <VersionList
                    versions={p.releases[selected.id]}
                    isInstalled={(v) => p.isInstalled(selected.id, v)}
                    onDownload={(release) => p.handleDownload(selected.id, release)}
                    onSelectVersion={(release) => p.handleSelectVersion(selected.id, release)}
                    onOpenFolder={(version) => {
                      const item = p.installed.find(
                        (i) =>
                          i.tool.id === selected.id &&
                          i.version.toLowerCase().includes(version.toLowerCase())
                      );
                      if (item) p.handleOpenFolder(item.path);
                    }}
                    downloading={p.downloads.find((d) => d.toolId === selected.id) || null}
                    selectedVersion={
                      p.selectedToolId === selected.id ? p.selectedVersion : undefined
                    }
                    showInfoButton={true}
                    onInfo={(release) => {
                      p.setInfoTool({
                        id: selected.id,
                        title: selected.title,
                        description: selected.description,
                        endpoint: selected.endpoint || "",
                        version: release.tag_name,
                        body: release.body,
                        extra: selected.extra,
                      });
                    }}
                  />
                )}
              </div>
            </div>
          )}

          <div className="proton-tools__section">
            <h3>{t("all_tools")}</h3>
            {allTools.map((tool) => (
              <div
                key={tool.id}
                className={`proton-tools__card ${p.selectedToolId === tool.id ? "proton-tools__card--selected" : ""}`}
              >
                <div
                  className="proton-tools__card-header"
                  onClick={() => p.toggleExpand(tool.id)}
                >
                  <div>
                    <h3>{tool.title}</h3>
                    <span className="desc">{tool.description}</span>
                  </div>
                  <div className="actions">
                    {tool.extra && (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          p.setInfoTool({
                            id: tool.id,
                            title: tool.title,
                            description: tool.description,
                            endpoint: tool.endpoint || "",
                            extra: tool.extra,
                          });
                        }}
                      >
                        ℹ️
                      </Button>
                    )}
                    <Button>{p.expanded.has(tool.id) ? "▼" : "▶"}</Button>
                  </div>
                </div>

                {p.expanded.has(tool.id) && (p.releases[tool.id] || []).length > 0 && (
                  <div className="proton-tools__versions">
                    <VersionList
                      versions={p.releases[tool.id] || []}
                      isInstalled={(v) => p.isInstalled(tool.id, v)}
                      onDownload={(release) => p.handleDownload(tool.id, release)}
                      onSelectVersion={(release) => p.handleSelectVersion(tool.id, release)}
                      onOpenFolder={(version) => {
                        const item = p.installed.find(
                          (i) =>
                            i.tool.id === tool.id &&
                            i.version.toLowerCase().includes(version.toLowerCase())
                        );
                        if (item) p.handleOpenFolder(item.path);
                      }}
                      downloading={p.downloads.find((d) => d.toolId === tool.id) || null}
                      selectedVersion={
                        p.selectedToolId === tool.id ? p.selectedVersion : undefined
                      }
                      showInfoButton={true}
                      onInfo={(release) => {
                        p.setInfoTool({
                          id: tool.id,
                          title: tool.title,
                          description: tool.description,
                          endpoint: tool.endpoint || "",
                          version: release.tag_name,
                          body: release.body,
                          extra: tool.extra,
                        });
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {p.activeTab === "downloads" && (
        <div className="proton-tools__content">
          <div className="proton-tools__section">
            <h3>{t("active_downloads")}</h3>
            <DownloadProgress downloads={p.downloads} />
          </div>
        </div>
      )}

      {p.activeTab === "installed" && (
        <div className="proton-tools__content">
          <div className="proton-tools__section">
            <h3>{t("installed")} ({p.installed.length})</h3>
            {p.installed.length === 0 ? (
              <div className="empty">{t("no_tools")}</div>
            ) : (
              p.installed.map((item, index) => (
                <div key={index} className="proton-tools__card installed">
                  <div className="proton-tools__card-header">
                    <div>
                      <h3>{item.tool.title}</h3>
                      <span>{item.version}</span>
                    </div>
                    <div className="actions">
                      <Button onClick={() => p.handleOpenFolder(item.path)}>
                        📂
                      </Button>
                      <Button
                        onClick={() =>
                          p.handleRemove(item.tool.id, item.path)
                        }
                      >
                        🗑️
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {p.activeTab === "games" && <GamesTab />}

      {p.infoTool && (
        <ProtonInfoModal
          tool={p.infoTool}
          onClose={() => p.setInfoTool(null)}
        />
      )}
    </div>
  );
}
